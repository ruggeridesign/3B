import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  type ApiVariables,
  isStoreMember,
  requireSession,
  sessionCtx,
} from '../../../http';
import {
  answerQuestion,
  askQuestion,
  findQuestion,
  listItemQuestions,
} from '../infra/question-repo';
import { createReport, listReports, resolveReport } from '../infra/report-repo';
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

const questionOut = z
  .object({
    id: z.string(),
    itemId: z.string(),
    authorId: z.string(),
    authorName: z.string().nullable(),
    body: z.string(),
    answer: z.string().nullable(),
    answeredAt: z.string().nullable(),
    createdAt: z.string(),
  })
  .openapi('Question');

const questionListOut = z
  .object({ questions: z.array(questionOut) })
  .openapi('QuestionList');

const askBody = z
  .object({ body: z.string().min(3).max(1000) })
  .openapi('AskQuestion');

const answerBody = z
  .object({ answer: z.string().min(1).max(2000) })
  .openapi('AnswerQuestion');

const reportTargetType = z.enum(['item', 'review', 'question', 'store']);
const reportStatus = z.enum(['open', 'reviewing', 'resolved', 'dismissed']);

const reportOut = z
  .object({
    id: z.string(),
    targetType: reportTargetType,
    targetId: z.string(),
    reason: z.string(),
    status: reportStatus,
    reporterId: z.string(),
    communityId: z.string(),
    resolutionNote: z.string().nullable(),
    resolvedBy: z.string().nullable(),
    resolvedAt: z.string().nullable(),
    createdAt: z.string(),
  })
  .openapi('Report');

const reportListOut = z
  .object({ reports: z.array(reportOut) })
  .openapi('ReportList');

const createReportBody = z
  .object({
    targetType: reportTargetType,
    targetId: z.string(),
    reason: z.string().min(3).max(1000),
  })
  .openapi('CreateReport');

const resolveReportBody = z
  .object({
    status: z.enum(['resolved', 'dismissed']),
    note: z.string().max(1000).optional(),
  })
  .openapi('ResolveReport');

const errorSchema = z.object({ error: z.string() }).openapi('SocialError');

const orderParam = z.object({
  id: z.string().openapi({ param: { name: 'id', in: 'path' } }),
});
const storeParam = z.object({
  id: z.string().openapi({ param: { name: 'id', in: 'path' } }),
});
const itemParam = z.object({
  id: z.string().openapi({ param: { name: 'id', in: 'path' } }),
});
const questionParam = z.object({
  id: z.string().openapi({ param: { name: 'id', in: 'path' } }),
});
const reportParam = z.object({
  id: z.string().openapi({ param: { name: 'id', in: 'path' } }),
});
const reportQuery = z.object({
  status: reportStatus
    .optional()
    .openapi({ param: { name: 'status', in: 'query' } }),
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

  // Preguntas públicas de un ítem.
  app.openapi(
    createRoute({
      method: 'get',
      path: '/items/{id}/questions',
      tags: ['social'],
      summary: 'Preguntas de un ítem',
      request: { params: itemParam },
      responses: {
        200: {
          description: 'OK',
          content: { 'application/json': { schema: questionListOut } },
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
      const questions = await listItemQuestions(db, id);
      return c.json({ questions }, 200);
    },
  );

  // Hacer una pregunta pública sobre un ítem publicado.
  app.openapi(
    createRoute({
      method: 'post',
      path: '/items/{id}/questions',
      tags: ['social'],
      summary: 'Preguntar sobre un ítem',
      request: {
        params: itemParam,
        body: { content: { 'application/json': { schema: askBody } } },
      },
      responses: {
        201: {
          description: 'Pregunta creada',
          content: { 'application/json': { schema: questionOut } },
        },
        401: {
          description: 'No autenticado',
          content: { 'application/json': { schema: errorSchema } },
        },
        404: {
          description: 'El ítem no existe, no es visible o no está publicado',
          content: { 'application/json': { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const { db, userId } = sessionCtx(c);
      const { id } = c.req.valid('param');
      const { body } = c.req.valid('json');
      const res = await askQuestion(db, id, userId, body);
      if (res.status === 'item_not_found') {
        return c.json({ error: 'No encontrado.' }, 404);
      }
      if (res.status === 'item_not_available') {
        return c.json({ error: 'Ese ítem no está publicado.' }, 404);
      }
      return c.json(res.question, 201);
    },
  );

  // Responder una pregunta (miembro de la tienda del ítem).
  app.openapi(
    createRoute({
      method: 'post',
      path: '/questions/{id}/answer',
      tags: ['social'],
      summary: 'Responder una pregunta',
      request: {
        params: questionParam,
        body: { content: { 'application/json': { schema: answerBody } } },
      },
      responses: {
        200: {
          description: 'Pregunta respondida',
          content: { 'application/json': { schema: questionOut } },
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
          description: 'La pregunta no existe o no es visible',
          content: { 'application/json': { schema: errorSchema } },
        },
        409: {
          description: 'La pregunta ya fue respondida',
          content: { 'application/json': { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const { db, userId } = sessionCtx(c);
      const { id } = c.req.valid('param');
      const { answer } = c.req.valid('json');

      const q = await findQuestion(db, id);
      if (!q) return c.json({ error: 'No encontrada.' }, 404);
      if (!(await isStoreMember(db, q.storeId))) {
        return c.json({ error: 'No sos miembro de esta tienda.' }, 403);
      }
      if (q.answered) {
        return c.json({ error: 'Esa pregunta ya fue respondida.' }, 409);
      }
      const res = await answerQuestion(db, id, userId, answer);
      if (res.status === 'not_found') {
        return c.json({ error: 'No encontrada.' }, 404);
      }
      return c.json(res.question, 200);
    },
  );

  // Reportar un contenido (cualquiera que vea la comunidad).
  app.openapi(
    createRoute({
      method: 'post',
      path: '/reports',
      tags: ['social'],
      summary: 'Reportar un contenido',
      request: {
        body: { content: { 'application/json': { schema: createReportBody } } },
      },
      responses: {
        201: {
          description: 'Reporte creado',
          content: { 'application/json': { schema: reportOut } },
        },
        401: {
          description: 'No autenticado',
          content: { 'application/json': { schema: errorSchema } },
        },
        404: {
          description: 'El contenido no existe o no es visible',
          content: { 'application/json': { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const { db, userId } = sessionCtx(c);
      const body = c.req.valid('json');
      const res = await createReport(db, userId, body);
      if (res.status === 'target_not_found') {
        return c.json({ error: 'No encontrado.' }, 404);
      }
      return c.json(res.report, 201);
    },
  );

  // Cola de reportes (la RLS la acota: admin de comunidad/plataforma o reporter).
  app.openapi(
    createRoute({
      method: 'get',
      path: '/reports',
      tags: ['social'],
      summary: 'Cola de reportes (moderación)',
      request: { query: reportQuery },
      responses: {
        200: {
          description: 'OK',
          content: { 'application/json': { schema: reportListOut } },
        },
        401: {
          description: 'No autenticado',
          content: { 'application/json': { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const { db } = sessionCtx(c);
      const { status } = c.req.valid('query');
      const reports = await listReports(db, status);
      return c.json({ reports }, 200);
    },
  );

  // Resolver/descartar un reporte (admin de la comunidad o de plataforma).
  app.openapi(
    createRoute({
      method: 'post',
      path: '/reports/{id}/resolve',
      tags: ['social'],
      summary: 'Resolver un reporte',
      request: {
        params: reportParam,
        body: {
          content: { 'application/json': { schema: resolveReportBody } },
        },
      },
      responses: {
        200: {
          description: 'Reporte resuelto',
          content: { 'application/json': { schema: reportOut } },
        },
        401: {
          description: 'No autenticado',
          content: { 'application/json': { schema: errorSchema } },
        },
        404: {
          description: 'No existe o no podés resolverlo',
          content: { 'application/json': { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const { db, userId } = sessionCtx(c);
      const { id } = c.req.valid('param');
      const { status, note } = c.req.valid('json');
      const res = await resolveReport(db, id, userId, status, note ?? null);
      if (res.status === 'not_found') {
        return c.json({ error: 'No encontrado.' }, 404);
      }
      return c.json(res.report, 200);
    },
  );

  return app;
}
