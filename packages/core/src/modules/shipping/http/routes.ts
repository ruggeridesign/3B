import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  type ApiVariables,
  isMoverApproved,
  isStoreMember,
  requireSession,
  sessionCtx,
} from '../../../http';
import { getOrder } from '../../orders';
import {
  createShipment,
  getShipment,
  getShipmentByOrder,
  listOpenShipments,
  listShipmentOffers,
  makeOffer,
} from '../infra/shipping-repo';

const money = z.string().regex(/^\d{1,10}(\.\d{1,2})?$/);
const shipmentStatus = z.enum([
  'solicitado',
  'ofertado',
  'asignado',
  'hacia_retiro',
  'retirado',
  'en_transito',
  'entregado',
  'cancelado',
  'fallido',
]);
const offerStatus = z.enum(['active', 'accepted', 'rejected', 'expired']);

const offerOut = z
  .object({
    id: z.string(),
    shipmentId: z.string(),
    moverId: z.string(),
    moverName: z.string().nullable(),
    price: money,
    etaMin: z.number().int(),
    status: offerStatus,
    expiresAt: z.string(),
    createdAt: z.string(),
  })
  .openapi('ShipmentOffer');

const shipmentOut = z
  .object({
    id: z.string(),
    orderId: z.string().nullable(),
    requesterId: z.string(),
    moverId: z.string().nullable(),
    communityId: z.string(),
    storeId: z.string().nullable(),
    status: shipmentStatus,
    packageNote: z.string().nullable(),
    originRef: z.string().nullable(),
    destRef: z.string().nullable(),
    agreedPrice: z.string().nullable(),
    createdAt: z.string(),
    offers: z.array(offerOut).optional(),
  })
  .openapi('Shipment');

const shipmentListOut = z
  .object({ shipments: z.array(shipmentOut) })
  .openapi('ShipmentList');
const offerListOut = z
  .object({ offers: z.array(offerOut) })
  .openapi('ShipmentOfferList');

const createShipmentBody = z
  .object({
    orderId: z.string(),
    packageNote: z.string().max(500).optional(),
  })
  .openapi('CreateShipment');

const createOfferBody = z
  .object({
    price: money,
    etaMin: z.number().int().positive().max(1440),
  })
  .openapi('CreateOffer');

const errorSchema = z.object({ error: z.string() }).openapi('ShippingError');

const idParam = z.object({
  id: z.string().openapi({ param: { name: 'id', in: 'path' } }),
});

/**
 * Router del módulo shipping (M6a). El Seller solicita un envío para un pedido
 * `delivery`; los Movers aprobados que operan en la comunidad ofertan (lo que mueve
 * el envío a `ofertado`). La RLS es el candado; la asignación + PIN llega en M6b.
 */
export function shippingRouter() {
  const app = new OpenAPIHono<{ Variables: ApiVariables }>();
  app.use('*', requireSession);

  // Solicitar un envío para un pedido delivery (miembro de la tienda).
  app.openapi(
    createRoute({
      method: 'post',
      path: '/shipments',
      tags: ['shipping'],
      summary: 'Solicitar un envío para un pedido',
      request: {
        body: {
          content: { 'application/json': { schema: createShipmentBody } },
        },
      },
      responses: {
        201: {
          description: 'Envío solicitado',
          content: { 'application/json': { schema: shipmentOut } },
        },
        400: {
          description: 'El pedido no es de envío a domicilio',
          content: { 'application/json': { schema: errorSchema } },
        },
        401: {
          description: 'No autenticado',
          content: { 'application/json': { schema: errorSchema } },
        },
        403: {
          description: 'No sos miembro de la tienda',
          content: { 'application/json': { schema: errorSchema } },
        },
        404: {
          description: 'El pedido no existe o no es visible',
          content: { 'application/json': { schema: errorSchema } },
        },
        409: {
          description: 'El pedido ya tiene un envío activo',
          content: { 'application/json': { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const { db, userId } = sessionCtx(c);
      const body = c.req.valid('json');

      const order = await getOrder(db, body.orderId);
      if (!order) return c.json({ error: 'No encontrado.' }, 404);
      if (!(await isStoreMember(db, order.storeId))) {
        return c.json({ error: 'No sos miembro de esta tienda.' }, 403);
      }

      const res = await createShipment(db, userId, body);
      if (res.status === 'order_not_found') {
        return c.json({ error: 'No encontrado.' }, 404);
      }
      if (res.status === 'not_delivery') {
        return c.json({ error: 'El pedido no es de envío a domicilio.' }, 400);
      }
      if (res.status === 'already_requested') {
        return c.json({ error: 'El pedido ya tiene un envío activo.' }, 409);
      }
      return c.json(res.shipment, 201);
    },
  );

  // Solicitudes abiertas (cola del Mover; la RLS acota a sus comunidades).
  app.openapi(
    createRoute({
      method: 'get',
      path: '/shipments/open',
      tags: ['shipping'],
      summary: 'Solicitudes de envío abiertas',
      responses: {
        200: {
          description: 'OK',
          content: { 'application/json': { schema: shipmentListOut } },
        },
        401: {
          description: 'No autenticado',
          content: { 'application/json': { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const { db } = sessionCtx(c);
      const shipments = await listOpenShipments(db);
      return c.json({ shipments }, 200);
    },
  );

  // Detalle de un envío (con ofertas).
  app.openapi(
    createRoute({
      method: 'get',
      path: '/shipments/{id}',
      tags: ['shipping'],
      summary: 'Detalle de un envío',
      request: { params: idParam },
      responses: {
        200: {
          description: 'OK',
          content: { 'application/json': { schema: shipmentOut } },
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
      const shipment = await getShipment(db, id);
      if (!shipment) return c.json({ error: 'No encontrado.' }, 404);
      return c.json(shipment, 200);
    },
  );

  // El envío (activo) de un pedido.
  app.openapi(
    createRoute({
      method: 'get',
      path: '/orders/{id}/shipment',
      tags: ['shipping'],
      summary: 'Envío de un pedido',
      request: { params: idParam },
      responses: {
        200: {
          description: 'OK',
          content: { 'application/json': { schema: shipmentOut } },
        },
        401: {
          description: 'No autenticado',
          content: { 'application/json': { schema: errorSchema } },
        },
        404: {
          description: 'No hay envío para ese pedido',
          content: { 'application/json': { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const { db } = sessionCtx(c);
      const { id } = c.req.valid('param');
      const shipment = await getShipmentByOrder(db, id);
      if (!shipment) return c.json({ error: 'Sin envío.' }, 404);
      return c.json(shipment, 200);
    },
  );

  // Ofertar sobre un envío (Mover aprobado que opera en la comunidad).
  app.openapi(
    createRoute({
      method: 'post',
      path: '/shipments/{id}/offers',
      tags: ['shipping'],
      summary: 'Ofertar sobre un envío',
      request: {
        params: idParam,
        body: { content: { 'application/json': { schema: createOfferBody } } },
      },
      responses: {
        201: {
          description: 'Oferta creada',
          content: { 'application/json': { schema: offerOut } },
        },
        400: {
          description: 'El envío ya no admite ofertas',
          content: { 'application/json': { schema: errorSchema } },
        },
        401: {
          description: 'No autenticado',
          content: { 'application/json': { schema: errorSchema } },
        },
        403: {
          description: 'No sos un Mover aprobado',
          content: { 'application/json': { schema: errorSchema } },
        },
        404: {
          description: 'El envío no existe o no es visible',
          content: { 'application/json': { schema: errorSchema } },
        },
        409: {
          description: 'Ya ofertaste sobre este envío',
          content: { 'application/json': { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const { db, userId } = sessionCtx(c);
      const { id } = c.req.valid('param');
      const body = c.req.valid('json');

      if (!(await isMoverApproved(db))) {
        return c.json({ error: 'No sos un Mover aprobado.' }, 403);
      }
      const res = await makeOffer(db, id, userId, body);
      if (res.status === 'shipment_not_found') {
        return c.json({ error: 'No encontrado.' }, 404);
      }
      if (res.status === 'closed') {
        return c.json({ error: 'El envío ya no admite ofertas.' }, 400);
      }
      if (res.status === 'duplicate') {
        return c.json({ error: 'Ya ofertaste sobre este envío.' }, 409);
      }
      return c.json(res.offer, 201);
    },
  );

  // Ofertas de un envío (el solicitante/tienda y el Mover que ofertó).
  app.openapi(
    createRoute({
      method: 'get',
      path: '/shipments/{id}/offers',
      tags: ['shipping'],
      summary: 'Ofertas de un envío',
      request: { params: idParam },
      responses: {
        200: {
          description: 'OK',
          content: { 'application/json': { schema: offerListOut } },
        },
        401: {
          description: 'No autenticado',
          content: { 'application/json': { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const { db } = sessionCtx(c);
      const { id } = c.req.valid('param');
      const offers = await listShipmentOffers(db, id);
      return c.json({ offers }, 200);
    },
  );

  return app;
}
