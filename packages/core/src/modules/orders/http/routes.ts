import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  type ApiVariables,
  isStoreMember,
  requireSession,
  sessionCtx,
} from '../../../http';
import { findTransition } from '../domain/transitions';
import {
  createOrder,
  getOrder,
  listMyOrders,
  listStoreOrders,
  transitionOrder,
} from '../infra/order-repo';

const uuid = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const money = z.string().regex(/^\d{1,10}(\.\d{1,2})?$/);
const currency = z.string().regex(/^[A-Z]{3}$/);
const fulfillment = z.enum(['pickup', 'delivery', 'service']);
const orderStatus = z.enum([
  'realizado',
  'aceptado',
  'rechazado',
  'expirado',
  'pago_reportado',
  'pago_confirmado',
  'pago_rechazado',
  'en_preparacion',
  'listo',
  'retirado',
  'en_envio',
  'entregado',
  'completado',
  'en_disputa',
  'cancelado',
]);

const addressSnapshot = z
  .object({
    label: z.string().max(80).optional(),
    line1: z.string().min(2).max(200),
    line2: z.string().max(200).optional(),
    city: z.string().max(80).optional(),
    phone: z.string().max(40).optional(),
    notes: z.string().max(300).optional(),
  })
  .openapi('OrderAddress');

const lineOut = z
  .object({
    id: z.string(),
    variantId: z.string().nullable(),
    itemId: z.string().nullable(),
    title: z.string(),
    sku: z.string().nullable(),
    unitPrice: money,
    currency,
    qty: z.number().int(),
    lineTotal: money,
  })
  .openapi('OrderItemLine');

const eventOut = z
  .object({
    id: z.string(),
    fromStatus: orderStatus.nullable(),
    toStatus: orderStatus,
    actorId: z.string().nullable(),
    reason: z.string().nullable(),
    createdAt: z.string(),
  })
  .openapi('OrderEvent');

const orderOut = z
  .object({
    id: z.string(),
    number: z.number().int(),
    storeId: z.string(),
    storeName: z.string().nullable(),
    communityId: z.string(),
    makerId: z.string(),
    status: orderStatus,
    fulfillment,
    subtotal: money,
    shippingAmount: money,
    feeAmount: money,
    total: money,
    currency,
    fxRateVes: z.string().nullable(),
    addressSnapshot: addressSnapshot.nullable(),
    note: z.string().nullable(),
    createdAt: z.string(),
    items: z.array(lineOut),
    events: z.array(eventOut).optional(),
  })
  .openapi('Order');

const orderListOut = z
  .object({ orders: z.array(orderOut) })
  .openapi('OrderList');

const createBody = z
  .object({
    storeId: uuid,
    fulfillment,
    items: z
      .array(
        z.object({
          variantId: uuid,
          qty: z.number().int().positive().max(999),
        }),
      )
      .min(1)
      .max(50),
    address: addressSnapshot.optional(),
    note: z.string().max(500).optional(),
  })
  .openapi('CreateOrder');

const transitionBody = z
  .object({
    toStatus: orderStatus,
    reason: z.string().max(300).optional(),
  })
  .openapi('OrderTransition');

const errorSchema = z.object({ error: z.string() }).openapi('OrderError');

/**
 * Estados alcanzables por la API en M5b (el Seller mueve el pedido hasta `listo`,
 * el Maker puede cancelar). Las aristas de pago (`pago_*`) se habilitan en M5c y
 * las de envío/entrega (`en_envio`/`entregado`/`completado`/`retirado`) en M6.
 */
const M5B_TARGETS = new Set<string>([
  'aceptado',
  'rechazado',
  'listo',
  'cancelado',
]);

const idParam = z.object({
  id: z.string().openapi({ param: { name: 'id', in: 'path' } }),
});
const storeParam = z.object({
  id: z.string().openapi({ param: { name: 'id', in: 'path' } }),
});

/**
 * Router del módulo orders (M5a). El Maker crea pedidos desde el carrito (uno por
 * tienda, con `Idempotency-Key`) y consulta "mis pedidos"; la tienda ve los que
 * recibe. Las transiciones de estado y la reserva de stock llegan en M5b.
 */
export function ordersRouter() {
  const app = new OpenAPIHono<{ Variables: ApiVariables }>();
  app.use('*', requireSession);

  // Crear un pedido (checkout de una tienda). Requiere `Idempotency-Key`.
  app.openapi(
    createRoute({
      method: 'post',
      path: '/orders',
      tags: ['orders'],
      summary: 'Crear un pedido desde el carrito (una tienda)',
      description:
        'Requiere la cabecera `Idempotency-Key`. Un reintento con la misma ' +
        'clave devuelve el pedido ya creado (200) en vez de duplicarlo.',
      request: {
        body: { content: { 'application/json': { schema: createBody } } },
      },
      responses: {
        200: {
          description: 'Ya existía (idempotente)',
          content: { 'application/json': { schema: orderOut } },
        },
        201: {
          description: 'Pedido creado (realizado)',
          content: { 'application/json': { schema: orderOut } },
        },
        400: {
          description: 'Falta Idempotency-Key, dirección o línea inválida',
          content: { 'application/json': { schema: errorSchema } },
        },
        401: {
          description: 'No autenticado',
          content: { 'application/json': { schema: errorSchema } },
        },
        404: {
          description: 'La tienda no existe o no es visible',
          content: { 'application/json': { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const { db, userId } = sessionCtx(c);
      const body = c.req.valid('json');
      const key = c.req.header('Idempotency-Key');
      if (!key || key.length < 8 || key.length > 100) {
        return c.json(
          { error: 'Falta la cabecera Idempotency-Key (8–100 caracteres).' },
          400,
        );
      }
      if (body.fulfillment === 'delivery' && !body.address) {
        return c.json(
          { error: 'El envío a domicilio requiere una dirección.' },
          400,
        );
      }
      const res = await createOrder(db, userId, body, key);
      if (res.status === 'store_not_found') {
        return c.json({ error: 'La tienda no existe o no es visible.' }, 404);
      }
      if (res.status === 'invalid_line') {
        return c.json({ error: res.detail }, 400);
      }
      return c.json(res.order, res.status === 'idempotent' ? 200 : 201);
    },
  );

  // Mis pedidos (como Maker).
  app.openapi(
    createRoute({
      method: 'get',
      path: '/orders',
      tags: ['orders'],
      summary: 'Mis pedidos (como comprador)',
      responses: {
        200: {
          description: 'OK',
          content: { 'application/json': { schema: orderListOut } },
        },
        401: {
          description: 'No autenticado',
          content: { 'application/json': { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const { db, userId } = sessionCtx(c);
      const orders = await listMyOrders(db, userId);
      return c.json({ orders }, 200);
    },
  );

  // Detalle de un pedido (Maker dueño o miembro de la tienda; la RLS acota).
  app.openapi(
    createRoute({
      method: 'get',
      path: '/orders/{id}',
      tags: ['orders'],
      summary: 'Detalle de un pedido',
      request: { params: idParam },
      responses: {
        200: {
          description: 'OK',
          content: { 'application/json': { schema: orderOut } },
        },
        401: {
          description: 'No autenticado',
          content: { 'application/json': { schema: errorSchema } },
        },
        404: {
          description: 'No existe o no es visible',
          content: { 'application/json': { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const { db } = sessionCtx(c);
      const { id } = c.req.valid('param');
      const order = await getOrder(db, id);
      if (!order) return c.json({ error: 'No encontrado.' }, 404);
      return c.json(order, 200);
    },
  );

  // Pedidos recibidos por una tienda. Solo miembros de la tienda.
  app.openapi(
    createRoute({
      method: 'get',
      path: '/stores/{id}/orders',
      tags: ['orders'],
      summary: 'Pedidos recibidos por la tienda',
      request: { params: storeParam },
      responses: {
        200: {
          description: 'OK',
          content: { 'application/json': { schema: orderListOut } },
        },
        401: {
          description: 'No autenticado',
          content: { 'application/json': { schema: errorSchema } },
        },
        403: {
          description: 'No sos miembro de la tienda',
          content: { 'application/json': { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const { db } = sessionCtx(c);
      const { id } = c.req.valid('param');
      if (!(await isStoreMember(db, id))) {
        return c.json({ error: 'No sos miembro de esta tienda.' }, 403);
      }
      const orders = await listStoreOrders(db, id);
      return c.json({ orders }, 200);
    },
  );

  // Mover un pedido por la máquina de estados (M5b). Según la arista (§6), la
  // dispara el Seller (miembro de la tienda) o el Maker (dueño del pedido); las
  // transiciones del sistema (plazos, Movers) no se disparan por acá.
  app.openapi(
    createRoute({
      method: 'post',
      path: '/orders/{id}/transition',
      tags: ['orders'],
      summary: 'Mover un pedido a otro estado',
      description:
        'Aplica una transición válida de la máquina de estados (§6). Reserva ' +
        'stock al aceptar y lo libera al cancelar. En M5b: aceptado, rechazado, ' +
        'listo (Seller) y cancelado (Maker).',
      request: {
        params: idParam,
        body: { content: { 'application/json': { schema: transitionBody } } },
      },
      responses: {
        200: {
          description: 'Pedido movido',
          content: { 'application/json': { schema: orderOut } },
        },
        400: {
          description: 'Transición inválida o no disponible',
          content: { 'application/json': { schema: errorSchema } },
        },
        401: {
          description: 'No autenticado',
          content: { 'application/json': { schema: errorSchema } },
        },
        403: {
          description: 'No podés disparar esa transición',
          content: { 'application/json': { schema: errorSchema } },
        },
        404: {
          description: 'No existe o no es visible',
          content: { 'application/json': { schema: errorSchema } },
        },
        409: {
          description: 'Stock insuficiente para reservar',
          content: { 'application/json': { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const { db, userId } = sessionCtx(c);
      const { id } = c.req.valid('param');
      const { toStatus, reason } = c.req.valid('json');

      // Cargar el pedido (bajo RLS) para conocer su estado, tienda y dueño.
      const order = await getOrder(db, id);
      if (!order) return c.json({ error: 'No encontrado.' }, 404);

      // ¿La arista existe en la máquina?
      const edge = findTransition(order.status, toStatus);
      if (!edge) {
        return c.json(
          { error: `No se puede pasar de "${order.status}" a "${toStatus}".` },
          400,
        );
      }
      // ¿Está habilitada en M5b?
      if (!M5B_TARGETS.has(toStatus)) {
        return c.json(
          { error: `La transición a "${toStatus}" aún no está disponible.` },
          400,
        );
      }
      // El actor correcto de la arista (defensa en capas; la RLS es el candado).
      if (edge.by === 'system') {
        return c.json({ error: 'Esa transición la hace el sistema.' }, 403);
      }
      if (edge.by === 'seller' && !(await isStoreMember(db, order.storeId))) {
        return c.json({ error: 'No sos miembro de esta tienda.' }, 403);
      }
      if (edge.by === 'maker' && order.makerId !== userId) {
        return c.json({ error: 'Solo el comprador puede hacer eso.' }, 403);
      }

      const res = await transitionOrder(
        db,
        id,
        userId,
        toStatus,
        reason ?? null,
      );
      if (res.status === 'not_found') {
        return c.json({ error: 'No encontrado.' }, 404);
      }
      if (res.status === 'invalid_transition') {
        return c.json(
          { error: `No se puede pasar de "${res.from}" a "${res.to}".` },
          400,
        );
      }
      if (res.status === 'insufficient') {
        return c.json(
          {
            error: `Stock insuficiente para reservar (disponible: ${res.available}).`,
          },
          409,
        );
      }
      return c.json(res.order, 200);
    },
  );

  return app;
}
