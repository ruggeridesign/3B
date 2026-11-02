import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  type ApiVariables,
  isStoreMember,
  requireSession,
  sessionCtx,
} from '../../../http';
import {
  createOrder,
  getOrder,
  listMyOrders,
  listStoreOrders,
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

const errorSchema = z.object({ error: z.string() }).openapi('OrderError');

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

  return app;
}
