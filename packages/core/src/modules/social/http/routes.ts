import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { type ApiVariables, requireSession, sessionCtx } from '../../../http';
import {
  createStoreReview,
  listOrderReviews,
  storeReviewSummary,
} from '../infra/review-repo';

const reviewOut = z
  .object({
    id: z.string(),
    orderId: z.string(),
    authorId: z.string(),
    authorName: z.string().nullable(),
    subjectType: z.enum(['store', 'mover', 'maker']),
    subjectId: z.string(),
    rating: z.number().int().min(1).max(5),
    body: z.string().nullable(),
    createdAt: z.string(),
  })
  .openapi('Review');

const reviewListOut = z
  .object({ reviews: z.array(reviewOut) })
  .openapi('ReviewList');

const summaryOut = z
  .object({
    storeId: z.string(),
    count: z.number().int(),
    average: z.number().nullable(),
    reviews: z.array(reviewOut),
  })
  .openapi('StoreReviewSummary');

const createBody = z
  .object({
    rating: z.number().int().min(1).max(5),
    body: z.string().max(1000).optional(),
  })
  .openapi('CreateReview');

const errorSchema = z.object({ error: z.string() }).openapi('SocialError');

const orderParam = z.object({
  id: z.string().openapi({ param: { name: 'id', in: 'path' } }),
});
const storeParam = z.object({
  id: z.string().openapi({ param: { name: 'id', in: 'path' } }),
});

/**
 * Router del módulo social (M5d.2). El comprador reseña la tienda de un pedido
 * `completado`; cualquiera que vea la comunidad lee las reseñas (la RLS es el
 * candado). Las preguntas públicas llegan en una rebanada posterior.
 */
export function socialRouter() {
  const app = new OpenAPIHono<{ Variables: ApiVariables }>();
  app.use('*', requireSession);

  // Dejar una reseña de la tienda de un pedido completado.
  app.openapi(
    createRoute({
      method: 'post',
      path: '/orders/{id}/reviews',
      tags: ['social'],
      summary: 'Reseñar la tienda de un pedido completado',
      request: {
        params: orderParam,
        body: { content: { 'application/json': { schema: createBody } } },
      },
      responses: {
        201: {
          description: 'Reseña creada',
          content: { 'application/json': { schema: reviewOut } },
        },
        400: {
          description: 'El pedido no está completado',
          content: { 'application/json': { schema: errorSchema } },
        },
        401: {
          description: 'No autenticado',
          content: { 'application/json': { schema: errorSchema } },
        },
        403: {
          description: 'Solo el comprador puede reseñar',
          content: { 'application/json': { schema: errorSchema } },
        },
        404: {
          description: 'El pedido no existe o no es visible',
          content: { 'application/json': { schema: errorSchema } },
        },
        409: {
          description: 'Ya reseñaste este pedido',
          content: { 'application/json': { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const { db, userId } = sessionCtx(c);
      const { id } = c.req.valid('param');
      const body = c.req.valid('json');

      const res = await createStoreReview(db, id, userId, body);
      if (res.status === 'order_not_found') {
        return c.json({ error: 'No encontrado.' }, 404);
      }
      if (res.status === 'forbidden') {
        return c.json({ error: 'Solo el comprador puede reseñar.' }, 403);
      }
      if (res.status === 'not_completed') {
        return c.json(
          {
            error: `El pedido está en "${res.current}"; se reseña al completarse.`,
          },
          400,
        );
      }
      if (res.status === 'duplicate') {
        return c.json({ error: 'Ya reseñaste este pedido.' }, 409);
      }
      return c.json(res.review, 201);
    },
  );

  // Reseñas de un pedido (para saber si ya reseñé).
  app.openapi(
    createRoute({
      method: 'get',
      path: '/orders/{id}/reviews',
      tags: ['social'],
      summary: 'Reseñas de un pedido',
      request: { params: orderParam },
      responses: {
        200: {
          description: 'OK',
          content: { 'application/json': { schema: reviewListOut } },
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
      const reviews = await listOrderReviews(db, id);
      return c.json({ reviews }, 200);
    },
  );

  // Resumen público de reseñas de una tienda (conteo + promedio + recientes).
  app.openapi(
    createRoute({
      method: 'get',
      path: '/stores/{id}/reviews',
      tags: ['social'],
      summary: 'Reseñas de una tienda',
      request: { params: storeParam },
      responses: {
        200: {
          description: 'OK',
          content: { 'application/json': { schema: summaryOut } },
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
      const summary = await storeReviewSummary(db, id);
      return c.json(summary, 200);
    },
  );

  return app;
}
