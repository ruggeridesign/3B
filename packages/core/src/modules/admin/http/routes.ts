import { sql } from '@3b/db';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { deleteCookie, setCookie } from 'hono/cookie';
import {
  type ApiVariables,
  realCtx,
  requirePlatformAdmin,
  requireRealPlatformAdmin,
  sessionCtx,
} from '../../../http';
import { listUsers, recordAudit } from '../infra/admin-store';

export const IMPERSONATE_COOKIE = '3b_impersonate';

const adminUser = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string().nullable(),
  isPlatformAdmin: z.boolean(),
});
const usersResponse = z
  .object({ users: z.array(adminUser) })
  .openapi('AdminUsers');
const okResponse = z.object({ ok: z.boolean() }).openapi('Ok');
const errorSchema = z.object({ error: z.string() }).openapi('AdminError');
const impersonateBody = z
  .object({ userId: z.string() })
  .openapi('ImpersonateBody');

const errorResponses = {
  401: {
    description: 'No autenticado',
    content: { 'application/json': { schema: errorSchema } },
  },
  403: {
    description: 'Prohibido',
    content: { 'application/json': { schema: errorSchema } },
  },
} as const;

/** Router del módulo admin. Acciones sensibles → gate + auditoría. */
export function adminRouter() {
  const app = new OpenAPIHono<{ Variables: ApiVariables }>();

  // Gate por capacidad (helpers reutilizables de @3b/core/http):
  // - lista de usuarios → admin de plataforma EFECTIVO,
  // - impersonación → admin de plataforma REAL (disponible aun impersonando).
  app.use('/admin/users', requirePlatformAdmin);
  app.use('/admin/impersonate', requireRealPlatformAdmin);

  app.openapi(
    createRoute({
      method: 'get',
      path: '/admin/users',
      tags: ['admin'],
      summary: 'Lista de usuarios (solo admin de plataforma)',
      responses: {
        200: {
          description: 'OK',
          content: { 'application/json': { schema: usersResponse } },
        },
        ...errorResponses,
      },
    }),
    async (c) => {
      const { db, userId } = sessionCtx(c);
      const users = await listUsers(db);
      await recordAudit(db, {
        actorId: userId,
        action: 'admin.users.list',
        metadata: { count: users.length },
      });
      return c.json({ users }, 200);
    },
  );

  // "Ver como": iniciar impersonación.
  app.openapi(
    createRoute({
      method: 'post',
      path: '/admin/impersonate',
      tags: ['admin'],
      summary: 'Ver la app como otro usuario (solo admin de plataforma real)',
      request: {
        body: {
          content: { 'application/json': { schema: impersonateBody } },
        },
      },
      responses: {
        200: {
          description: 'OK',
          content: { 'application/json': { schema: okResponse } },
        },
        ...errorResponses,
      },
    }),
    async (c) => {
      const { db, realUserId } = realCtx(c);
      const { userId: target } = c.req.valid('json');
      setCookie(c, IMPERSONATE_COOKIE, target, {
        httpOnly: true,
        path: '/',
        sameSite: 'Lax',
      });
      await recordAudit(db, {
        actorId: realUserId,
        action: 'admin.impersonate.start',
        subjectType: 'user',
        subjectId: target,
      });
      return c.json({ ok: true }, 200);
    },
  );

  // Dejar de impersonar (volver a la propia cuenta).
  app.openapi(
    createRoute({
      method: 'delete',
      path: '/admin/impersonate',
      tags: ['admin'],
      summary: 'Volver a tu propia cuenta',
      responses: {
        200: {
          description: 'OK',
          content: { 'application/json': { schema: okResponse } },
        },
        ...errorResponses,
      },
    }),
    async (c) => {
      const { db, realUserId } = realCtx(c);
      deleteCookie(c, IMPERSONATE_COOKIE, { path: '/' });
      // Volver el contexto RLS al admin real para auditar como él.
      await db.execute(
        sql`select set_config('app.user_id', ${realUserId}, true)`,
      );
      await recordAudit(db, {
        actorId: realUserId,
        action: 'admin.impersonate.stop',
      });
      return c.json({ ok: true }, 200);
    },
  );

  return app;
}
