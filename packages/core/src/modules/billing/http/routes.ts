import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { type ApiVariables, requireSession, sessionCtx } from '../../../http';
import {
  getStatement,
  getSubscription,
  listFeeAccruals,
  listPlans,
  listStatements,
  setSubscription,
} from '../infra/billing-repo';

const money = z.string().regex(/^\d{1,10}(\.\d{1,2})?$/);
const currency = z.string().regex(/^[A-Z]{3}$/);
const planCode = z.enum(['seller_products', 'seller_services']);
const subStatus = z.enum(['trial', 'active', 'past_due', 'cancelled']);

const planOut = z
  .object({
    id: z.string(),
    code: planCode,
    name: z.string(),
    priceAmount: money,
    currency,
  })
  .openapi('Plan');

const planListOut = z.object({ plans: z.array(planOut) }).openapi('PlanList');

const subOut = z
  .object({
    id: z.string(),
    storeId: z.string(),
    planId: z.string(),
    planCode,
    planName: z.string(),
    priceAmount: money,
    currency,
    status: subStatus,
    periodEnd: z.string().nullable(),
    createdAt: z.string(),
  })
  .openapi('Subscription');

const setSubBody = z
  .object({
    status: subStatus,
    planCode: planCode.optional(),
    periodEnd: z.string().datetime().optional(),
  })
  .openapi('SetSubscription');

const feeOut = z
  .object({
    id: z.string(),
    subjectType: z.enum(['store', 'mover']),
    subjectId: z.string(),
    kind: z.enum(['sale', 'shipment']),
    amount: money,
    currency,
    communityId: z.string(),
    orderId: z.string().nullable(),
    shipmentId: z.string().nullable(),
    accruedAt: z.string(),
  })
  .openapi('FeeAccrual');

const feeListOut = z
  .object({ accruals: z.array(feeOut), total: money, currency })
  .openapi('FeeAccrualList');

const statementStatus = z.enum(['open', 'pending', 'paid']);

const statementOut = z
  .object({
    id: z.string(),
    subjectType: z.enum(['store', 'mover']),
    subjectId: z.string(),
    period: z.string(),
    subscriptionAmount: money,
    commissionAmount: money,
    total: money,
    currency,
    status: statementStatus,
    communityId: z.string().nullable(),
    createdAt: z.string(),
  })
  .openapi('Statement');

const statementListOut = z
  .object({ statements: z.array(statementOut) })
  .openapi('StatementList');

const errorSchema = z.object({ error: z.string() }).openapi('BillingError');

const storeParam = z.object({
  id: z.string().openapi({ param: { name: 'id', in: 'path' } }),
});

/**
 * Router del módulo billing (M7a). Planes (lectura pública) + la suscripción de una
 * tienda (la ve su equipo o un admin; la cambia un admin). Las comisiones y los
 * estados de cuenta llegan en M7b/M7c. La RLS es el candado.
 */
export function billingRouter() {
  const app = new OpenAPIHono<{ Variables: ApiVariables }>();
  app.use('*', requireSession);

  // Planes disponibles.
  app.openapi(
    createRoute({
      method: 'get',
      path: '/plans',
      tags: ['billing'],
      summary: 'Planes de suscripción',
      responses: {
        200: {
          description: 'OK',
          content: { 'application/json': { schema: planListOut } },
        },
        401: {
          description: 'No autenticado',
          content: { 'application/json': { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const { db } = sessionCtx(c);
      const plans = await listPlans(db);
      return c.json({ plans }, 200);
    },
  );

  // Suscripción de una tienda.
  app.openapi(
    createRoute({
      method: 'get',
      path: '/stores/{id}/subscription',
      tags: ['billing'],
      summary: 'Suscripción de la tienda',
      request: { params: storeParam },
      responses: {
        200: {
          description: 'OK',
          content: { 'application/json': { schema: subOut } },
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
      const sub = await getSubscription(db, id);
      if (!sub) return c.json({ error: 'No encontrada.' }, 404);
      return c.json(sub, 200);
    },
  );

  // Fijar estado/plan de la suscripción (admin de comunidad o plataforma).
  app.openapi(
    createRoute({
      method: 'post',
      path: '/stores/{id}/subscription',
      tags: ['billing'],
      summary: 'Fijar la suscripción (admin)',
      request: {
        params: storeParam,
        body: { content: { 'application/json': { schema: setSubBody } } },
      },
      responses: {
        200: {
          description: 'Suscripción actualizada',
          content: { 'application/json': { schema: subOut } },
        },
        400: {
          description: 'Plan inválido',
          content: { 'application/json': { schema: errorSchema } },
        },
        401: {
          description: 'No autenticado',
          content: { 'application/json': { schema: errorSchema } },
        },
        404: {
          description: 'No existe o no podés cambiarla',
          content: { 'application/json': { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const { db } = sessionCtx(c);
      const { id } = c.req.valid('param');
      const body = c.req.valid('json');
      const res = await setSubscription(db, id, body);
      if (res.status === 'invalid_plan') {
        return c.json({ error: 'Plan inválido.' }, 400);
      }
      if (res.status === 'not_found') {
        return c.json({ error: 'No existe o no podés cambiarla.' }, 404);
      }
      return c.json(res.subscription, 200);
    },
  );

  // Comisiones devengadas de una tienda (equipo o admin).
  app.openapi(
    createRoute({
      method: 'get',
      path: '/stores/{id}/fee-accruals',
      tags: ['billing'],
      summary: 'Comisiones devengadas de la tienda',
      request: { params: storeParam },
      responses: {
        200: {
          description: 'OK',
          content: { 'application/json': { schema: feeListOut } },
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
      const fees = await listFeeAccruals(db, 'store', id);
      return c.json(fees, 200);
    },
  );

  // Mis comisiones devengadas como Mover.
  app.openapi(
    createRoute({
      method: 'get',
      path: '/me/fee-accruals',
      tags: ['billing'],
      summary: 'Mis comisiones devengadas (Mover)',
      responses: {
        200: {
          description: 'OK',
          content: { 'application/json': { schema: feeListOut } },
        },
        401: {
          description: 'No autenticado',
          content: { 'application/json': { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const { db, userId } = sessionCtx(c);
      const fees = await listFeeAccruals(db, 'mover', userId);
      return c.json(fees, 200);
    },
  );

  // Estados de cuenta de una tienda (equipo o admin).
  app.openapi(
    createRoute({
      method: 'get',
      path: '/stores/{id}/statements',
      tags: ['billing'],
      summary: 'Estados de cuenta de la tienda',
      request: { params: storeParam },
      responses: {
        200: {
          description: 'OK',
          content: { 'application/json': { schema: statementListOut } },
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
      const list = await listStatements(db, 'store', id);
      return c.json(list, 200);
    },
  );

  // Mis estados de cuenta como Mover.
  app.openapi(
    createRoute({
      method: 'get',
      path: '/me/statements',
      tags: ['billing'],
      summary: 'Mis estados de cuenta (Mover)',
      responses: {
        200: {
          description: 'OK',
          content: { 'application/json': { schema: statementListOut } },
        },
        401: {
          description: 'No autenticado',
          content: { 'application/json': { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const { db, userId } = sessionCtx(c);
      const list = await listStatements(db, 'mover', userId);
      return c.json(list, 200);
    },
  );

  // Un estado de cuenta por id (la RLS acota la visibilidad).
  app.openapi(
    createRoute({
      method: 'get',
      path: '/statements/{id}',
      tags: ['billing'],
      summary: 'Estado de cuenta por id',
      request: { params: storeParam },
      responses: {
        200: {
          description: 'OK',
          content: { 'application/json': { schema: statementOut } },
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
      const statement = await getStatement(db, id);
      if (!statement) return c.json({ error: 'No encontrado.' }, 404);
      return c.json(statement, 200);
    },
  );

  return app;
}
