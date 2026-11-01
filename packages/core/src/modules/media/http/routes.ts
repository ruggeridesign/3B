import type { AppTransaction } from '@3b/db';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { type ApiVariables, requireSession, sessionCtx } from '../../../http';
import {
  createPendingMedia,
  deleteMediaRecord,
  getMediaById,
  listMediaByOwner,
  type MediaRecord,
  markMediaReady,
} from '../infra/media-repo';
import type { MediaStorage } from '../storage';

const ownerType = z.enum(['store', 'user', 'item']);

/**
 * Autoriza el uso de media de una entidad. Lo **inyecta `apps/api`** (que conoce
 * todos los módulos) para que `media` no dependa de `store`/`catalog`: resuelve
 * si el usuario puede subir/ver media de ese `ownerType`/`ownerId`.
 */
export type AuthorizeOwner = (
  db: AppTransaction,
  userId: string,
  ownerType: 'store' | 'user' | 'item',
  ownerId: string,
) => Promise<boolean>;
const mime = z.enum([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'application/pdf',
]);
const status = z.enum(['pending', 'ready']);

const mediaOut = z
  .object({
    id: z.string(),
    ownerType,
    ownerId: z.string(),
    mime,
    status,
    url: z.string(),
    createdAt: z.string(),
  })
  .openapi('Media');

const mediaListOut = z
  .object({ media: z.array(mediaOut) })
  .openapi('MediaList');

const uploadOut = z
  .object({
    url: z.string(),
    method: z.literal('PUT'),
    headers: z.record(z.string(), z.string()),
    expiresAt: z.string(),
  })
  .openapi('UploadTarget');

const createOut = z
  .object({ media: mediaOut, upload: uploadOut })
  .openapi('CreateMediaResponse');

const createBody = z
  .object({
    ownerType,
    ownerId: z
      .string()
      .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),
    mime,
  })
  .openapi('CreateMedia');

const listQuery = z.object({
  ownerType,
  ownerId: z.string(),
});

const idParam = z.object({
  id: z.string().openapi({ param: { name: 'id', in: 'path' } }),
});

const errorSchema = z.object({ error: z.string() }).openapi('MediaError');

/** Opciones del router de media: storage + autorización por entidad (inyectados). */
export interface MediaRouterOptions {
  storage: MediaStorage;
  authorizeOwner: AuthorizeOwner;
}

export function mediaRouter({ storage, authorizeOwner }: MediaRouterOptions) {
  const app = new OpenAPIHono<{ Variables: ApiVariables }>();
  app.use('*', requireSession);

  const toDto = (m: MediaRecord) => ({
    id: m.id,
    ownerType: m.ownerType,
    ownerId: m.ownerId,
    mime: m.mime,
    status: m.status,
    url: storage.publicUrl(m.key),
    createdAt: m.createdAt,
  });

  // Fase 1: crear la fila pending + devolver el destino de subida firmado.
  app.openapi(
    createRoute({
      method: 'post',
      path: '/media',
      tags: ['media'],
      summary: 'Iniciar una subida de archivo',
      request: {
        body: { content: { 'application/json': { schema: createBody } } },
      },
      responses: {
        201: {
          description: 'Creada (pendiente de subir)',
          content: { 'application/json': { schema: createOut } },
        },
        401: {
          description: 'No autenticado',
          content: { 'application/json': { schema: errorSchema } },
        },
        403: {
          description: 'No podés subir media para esa entidad',
          content: { 'application/json': { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const { db, userId } = sessionCtx(c);
      const body = c.req.valid('json');
      if (!(await authorizeOwner(db, userId, body.ownerType, body.ownerId))) {
        return c.json({ error: 'No podés subir media para esa entidad.' }, 403);
      }
      const media = await createPendingMedia(db, body);
      const upload = storage.signUpload({ key: media.key, mime: media.mime });
      return c.json({ media: toDto(media), upload }, 201);
    },
  );

  // Listar la media de una entidad.
  app.openapi(
    createRoute({
      method: 'get',
      path: '/media',
      tags: ['media'],
      summary: 'Media de una entidad',
      request: { query: listQuery },
      responses: {
        200: {
          description: 'OK',
          content: { 'application/json': { schema: mediaListOut } },
        },
        401: {
          description: 'No autenticado',
          content: { 'application/json': { schema: errorSchema } },
        },
        403: {
          description: 'No podés ver media de esa entidad',
          content: { 'application/json': { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const { db, userId } = sessionCtx(c);
      const { ownerType: type, ownerId } = c.req.valid('query');
      if (!(await authorizeOwner(db, userId, type, ownerId))) {
        return c.json({ error: 'No podés ver media de esa entidad.' }, 403);
      }
      const rows = await listMediaByOwner(db, type, ownerId);
      return c.json({ media: rows.map(toDto) }, 200);
    },
  );

  // Una media por id. La RLS acota la visibilidad (el dueño que la subió, el
  // admin de plataforma, o quien pueda ver una verificación KYC que la referencie).
  app.openapi(
    createRoute({
      method: 'get',
      path: '/media/{id}',
      tags: ['media'],
      summary: 'Una media por id',
      request: { params: idParam },
      responses: {
        200: {
          description: 'OK',
          content: { 'application/json': { schema: mediaOut } },
        },
        401: {
          description: 'No autenticado',
          content: { 'application/json': { schema: errorSchema } },
        },
        404: {
          description: 'No existe (o no podés verla)',
          content: { 'application/json': { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const { db } = sessionCtx(c);
      const { id } = c.req.valid('param');
      const media = await getMediaById(db, id);
      if (!media) return c.json({ error: 'No existe esa media.' }, 404);
      return c.json(toDto(media), 200);
    },
  );

  // Fase 3: confirmar que el archivo se subió → marcar ready.
  app.openapi(
    createRoute({
      method: 'post',
      path: '/media/{id}/complete',
      tags: ['media'],
      summary: 'Confirmar una subida',
      request: { params: idParam },
      responses: {
        200: {
          description: 'Lista',
          content: { 'application/json': { schema: mediaOut } },
        },
        401: {
          description: 'No autenticado',
          content: { 'application/json': { schema: errorSchema } },
        },
        404: {
          description: 'No existe (o no es tuya)',
          content: { 'application/json': { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const { db } = sessionCtx(c);
      const { id } = c.req.valid('param');
      const media = await markMediaReady(db, id);
      if (!media) return c.json({ error: 'No existe esa media.' }, 404);
      return c.json(toDto(media), 200);
    },
  );

  // Borrar una media.
  app.openapi(
    createRoute({
      method: 'delete',
      path: '/media/{id}',
      tags: ['media'],
      summary: 'Borrar una media',
      request: { params: idParam },
      responses: {
        204: { description: 'Borrada' },
        401: {
          description: 'No autenticado',
          content: { 'application/json': { schema: errorSchema } },
        },
        404: {
          description: 'No existe (o no es tuya)',
          content: { 'application/json': { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const { db } = sessionCtx(c);
      const { id } = c.req.valid('param');
      const deleted = await deleteMediaRecord(db, id);
      if (!deleted) return c.json({ error: 'No existe esa media.' }, 404);
      return c.body(null, 204);
    },
  );

  return app;
}
