import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  type ApiVariables,
  isStoreMember,
  requireSession,
  sessionCtx,
} from '../../../http';
import { getOrder } from '../../orders';
import {
  listPaymentsForOrder,
  reportPayment,
  reviewPayment,
} from '../infra/payment-repo';

const money = z.string().regex(/^\d{1,10}(\.\d{1,2})?$/);
const currency = z.string().regex(/^[A-Z]{3}$/);
const method = z.enum([
  'pago_movil',
  'transferencia',
  'zelle',
  'binance',
  'efectivo',
  'otro',
]);
const paymentStatus = z.enum(['reported', 'confirmed', 'rejected']);

const paymentOut = z
  .object({
    id: z.string(),
    orderId: z.string(),
    method,
    amount: money,
    currency,
    reference: z.string(),
    status: paymentStatus,
    note: z.string().nullable(),
    proofMediaId: z.string().nullable(),
    reportedBy: z.string(),
    reviewedBy: z.string().nullable(),
    reviewedAt: z.string().nullable(),
    createdAt: z.string(),
  })
  .openapi('PaymentReport');

const paymentListOut = z
  .object({ payments: z.array(paymentOut) })
  .openapi('PaymentReportList');

const reportBody = z
  .object({
    method,
    reference: z.string().min(2).max(80),
    amount: money,
    currency: currency.default('USD'),
    note: z.string().max(300).optional(),
    proofMediaId: z.string().optional(),
  })
  .openapi('ReportPayment');

const reviewBody = z
  .object({
    decision: z.enum(['confirm', 'reject']),
    reason: z.string().max(300).optional(),
  })
  .openapi('ReviewPayment');

const errorSchema = z.object({ error: z.string() }).openapi('PaymentError');

const orderParam = z.object({
  id: z.string().openapi({ param: { name: 'id', in: 'path' } }),
});
const reviewParam = z.object({
  id: z.string().openapi({ param: { name: 'id', in: 'path' } }),
  paymentId: z.string().openapi({ param: { name: 'paymentId', in: 'path' } }),
});

/**
 * Router del módulo payments (M5c). El Maker reporta un pago (comprobante) de un
 * pedido `aceptado` → `pago_reportado`; el Seller lo confirma (`pago_confirmado`)
 * o lo rechaza (`pago_rechazado`). Las transiciones del pedido las dispara el
 * repo vía la API pública de `orders`.
 */
export function paymentsRouter() {
  const app = new OpenAPIHono<{ Variables: ApiVariables }>();
  app.use('*', requireSession);

  // Reportar un pago (Maker dueño del pedido).
  app.openapi(
    createRoute({
      method: 'post',
      path: '/orders/{id}/payments',
      tags: ['payments'],
      summary: 'Reportar un pago (comprobante)',
      request: {
        params: orderParam,
        body: { content: { 'application/json': { schema: reportBody } } },
      },
      responses: {
        201: {
          description: 'Pago reportado',
          content: { 'application/json': { schema: paymentOut } },
        },
        400: {
          description: 'El pedido no está en estado para reportar pago',
          content: { 'application/json': { schema: errorSchema } },
        },
        401: {
          description: 'No autenticado',
          content: { 'application/json': { schema: errorSchema } },
        },
        403: {
          description: 'Solo el comprador puede reportar el pago',
          content: { 'application/json': { schema: errorSchema } },
        },
        404: {
          description: 'El pedido no existe o no es visible',
          content: { 'application/json': { schema: errorSchema } },
        },
        409: {
          description: 'Esa referencia ya fue reportada',
          content: { 'application/json': { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const { db, userId } = sessionCtx(c);
      const { id } = c.req.valid('param');
      const body = c.req.valid('json');

      const order = await getOrder(db, id);
      if (!order) return c.json({ error: 'No encontrado.' }, 404);
      if (order.makerId !== userId) {
        return c.json(
          { error: 'Solo el comprador puede reportar el pago.' },
          403,
        );
      }

      const res = await reportPayment(db, id, userId, body);
      if (res.status === 'order_not_found') {
        return c.json({ error: 'No encontrado.' }, 404);
      }
      if (res.status === 'invalid_state') {
        return c.json(
          {
            error: `El pedido está en "${res.current}"; no se puede reportar pago.`,
          },
          400,
        );
      }
      if (res.status === 'duplicate_reference') {
        return c.json({ error: 'Esa referencia ya fue reportada.' }, 409);
      }
      return c.json(res.payment, 201);
    },
  );

  // Listar los reportes de un pedido (Maker dueño o miembro de la tienda).
  app.openapi(
    createRoute({
      method: 'get',
      path: '/orders/{id}/payments',
      tags: ['payments'],
      summary: 'Reportes de pago del pedido',
      request: { params: orderParam },
      responses: {
        200: {
          description: 'OK',
          content: { 'application/json': { schema: paymentListOut } },
        },
        401: {
          description: 'No autenticado',
          content: { 'application/json': { schema: errorSchema } },
        },
        404: {
          description: 'El pedido no existe o no es visible',
          content: { 'application/json': { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const { db } = sessionCtx(c);
      const { id } = c.req.valid('param');
      const order = await getOrder(db, id);
      if (!order) return c.json({ error: 'No encontrado.' }, 404);
      const payments = await listPaymentsForOrder(db, id);
      return c.json({ payments }, 200);
    },
  );

  // Revisar un reporte: confirmar o rechazar (miembro de la tienda).
  app.openapi(
    createRoute({
      method: 'post',
      path: '/orders/{id}/payments/{paymentId}/review',
      tags: ['payments'],
      summary: 'Confirmar o rechazar un pago',
      request: {
        params: reviewParam,
        body: { content: { 'application/json': { schema: reviewBody } } },
      },
      responses: {
        200: {
          description: 'Pago revisado',
          content: { 'application/json': { schema: paymentOut } },
        },
        400: {
          description: 'El pedido no está en estado para revisar pago',
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
          description: 'No existe el pedido o el reporte',
          content: { 'application/json': { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const { db, userId } = sessionCtx(c);
      const { id, paymentId } = c.req.valid('param');
      const { decision, reason } = c.req.valid('json');

      const order = await getOrder(db, id);
      if (!order) return c.json({ error: 'No encontrado.' }, 404);
      if (!(await isStoreMember(db, order.storeId))) {
        return c.json({ error: 'No sos miembro de esta tienda.' }, 403);
      }

      const res = await reviewPayment(
        db,
        id,
        paymentId,
        userId,
        decision,
        reason ?? null,
      );
      if (res.status === 'not_found') {
        return c.json({ error: 'No existe el pedido o el reporte.' }, 404);
      }
      if (res.status === 'invalid_state') {
        return c.json(
          {
            error: `El pedido está en "${res.current}"; no se puede revisar el pago.`,
          },
          400,
        );
      }
      return c.json(res.payment, 200);
    },
  );

  return app;
}
