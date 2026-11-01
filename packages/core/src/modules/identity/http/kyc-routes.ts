import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  type ApiVariables,
  canManageStore,
  isCommunityAdmin,
  requireSession,
  sessionCtx,
} from '../../../http';
import {
  createSubmission,
  getReviewCommunity,
  listPendingByCommunity,
  listSubmissionsBySubject,
  reviewSubmission,
} from '../infra/kyc-repo';

const uuid = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const docType = z.enum(['rif', 'cedula', 'pasaporte', 'other']);
const subjectType = z.enum(['store', 'mover']);
const kycStatus = z.enum(['pending', 'approved', 'rejected']);

const submissionOut = z
  .object({
    id: z.string(),
    subjectType,
    subjectId: z.string(),
    docType,
    mediaId: z.string().nullable(),
    status: kycStatus,
    reviewerId: z.string().nullable(),
    reviewNotes: z.string().nullable(),
    expiresAt: z.string().nullable(),
    reviewedAt: z.string().nullable(),
    createdAt: z.string(),
  })
  .openapi('KycSubmission');

const submissionListOut = z
  .object({ submissions: z.array(submissionOut) })
  .openapi('KycSubmissionList');

const createBody = z
  .object({
    docType,
    mediaId: uuid.nullable().optional(),
    expiresAt: z.string().datetime().nullable().optional(),
  })
  .openapi('CreateKycSubmission');

const reviewBody = z
  .object({
    decision: z.enum(['approve', 'reject']),
    notes: z.string().max(2000).nullable().optional(),
  })
  .openapi('ReviewKyc');

const errorSchema = z.object({ error: z.string() }).openapi('KycError');

const storeParam = z.object({
  id: z.string().openapi({ param: { name: 'id', in: 'path' } }),
});
const submissionParam = z.object({
  id: z.string().openapi({ param: { name: 'id', in: 'path' } }),
});

/**
 * Router de verificación (KYC). Vive en identity (dueño de `kyc_submissions`),
 * con rutas anidadas bajo la tienda (alta/listado del equipo) y la comunidad
 * (cola del revisor), más la revisión por id. Solo `store` en M2.
 */
export function kycRouter() {
  const app = new OpenAPIHono<{ Variables: ApiVariables }>();
  app.use('*', requireSession);

  // Alta de una verificación de tienda. Solo owner/admin de la tienda.
  app.openapi(
    createRoute({
      method: 'post',
      path: '/stores/{id}/kyc',
      tags: ['identity'],
      summary: 'Enviar una verificación (KYC) de la tienda',
      request: {
        params: storeParam,
        body: { content: { 'application/json': { schema: createBody } } },
      },
      responses: {
        201: {
          description: 'Enviada',
          content: { 'application/json': { schema: submissionOut } },
        },
        401: {
          description: 'No autenticado',
          content: { 'application/json': { schema: errorSchema } },
        },
        403: {
          description: 'No podés administrar esta tienda',
          content: { 'application/json': { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const { db } = sessionCtx(c);
      const { id } = c.req.valid('param');
      const body = c.req.valid('json');
      if (!(await canManageStore(db, id))) {
        return c.json({ error: 'No podés administrar esta tienda.' }, 403);
      }
      const submission = await createSubmission(db, {
        subjectType: 'store',
        subjectId: id,
        ...body,
      });
      return c.json(submission, 201);
    },
  );

  // Verificaciones de una tienda (historial). Solo owner/admin de la tienda.
  app.openapi(
    createRoute({
      method: 'get',
      path: '/stores/{id}/kyc',
      tags: ['identity'],
      summary: 'Verificaciones de la tienda',
      request: { params: storeParam },
      responses: {
        200: {
          description: 'OK',
          content: { 'application/json': { schema: submissionListOut } },
        },
        401: {
          description: 'No autenticado',
          content: { 'application/json': { schema: errorSchema } },
        },
        403: {
          description: 'No podés administrar esta tienda',
          content: { 'application/json': { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const { db } = sessionCtx(c);
      const { id } = c.req.valid('param');
      if (!(await canManageStore(db, id))) {
        return c.json({ error: 'No podés administrar esta tienda.' }, 403);
      }
      const submissions = await listSubmissionsBySubject(db, 'store', id);
      return c.json({ submissions }, 200);
    },
  );

  // Cola de revisión de una comunidad (verificaciones pendientes). Admin de ESA
  // comunidad.
  app.openapi(
    createRoute({
      method: 'get',
      path: '/communities/{id}/kyc',
      tags: ['identity'],
      summary: 'Cola de verificaciones pendientes de la comunidad',
      request: { params: storeParam },
      responses: {
        200: {
          description: 'OK',
          content: { 'application/json': { schema: submissionListOut } },
        },
        401: {
          description: 'No autenticado',
          content: { 'application/json': { schema: errorSchema } },
        },
        403: {
          description: 'No sos admin de esta comunidad',
          content: { 'application/json': { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const { db } = sessionCtx(c);
      const { id } = c.req.valid('param');
      if (!(await isCommunityAdmin(db, id))) {
        return c.json({ error: 'No sos admin de esta comunidad.' }, 403);
      }
      const submissions = await listPendingByCommunity(db, id);
      return c.json({ submissions }, 200);
    },
  );

  // Revisar (aprobar/rechazar) una verificación. Solo el admin de la comunidad de
  // la tienda. El trigger fija el verification_level al aprobar/rechazar.
  app.openapi(
    createRoute({
      method: 'post',
      path: '/kyc/{id}/review',
      tags: ['identity'],
      summary: 'Aprobar o rechazar una verificación',
      request: {
        params: submissionParam,
        body: { content: { 'application/json': { schema: reviewBody } } },
      },
      responses: {
        200: {
          description: 'Revisada',
          content: { 'application/json': { schema: submissionOut } },
        },
        401: {
          description: 'No autenticado',
          content: { 'application/json': { schema: errorSchema } },
        },
        403: {
          description: 'No podés revisar esta verificación',
          content: { 'application/json': { schema: errorSchema } },
        },
        404: {
          description: 'No existe esa verificación',
          content: { 'application/json': { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const { db, userId } = sessionCtx(c);
      const { id } = c.req.valid('param');
      const { decision, notes } = c.req.valid('json');
      // El revisor debe ser admin de la comunidad de la tienda del sujeto.
      const communityId = await getReviewCommunity(db, id);
      if (!communityId) {
        return c.json({ error: 'No existe esa verificación.' }, 404);
      }
      if (!(await isCommunityAdmin(db, communityId))) {
        return c.json({ error: 'No podés revisar esta verificación.' }, 403);
      }
      const submission = await reviewSubmission(
        db,
        id,
        userId,
        decision,
        notes ?? null,
      );
      if (!submission) {
        return c.json({ error: 'No existe esa verificación.' }, 404);
      }
      return c.json(submission, 200);
    },
  );

  return app;
}
