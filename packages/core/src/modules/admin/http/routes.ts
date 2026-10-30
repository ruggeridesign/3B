import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { ApiVariables } from '../../../http';
import { listUsers, recordAudit } from '../infra/admin-store';

const adminUser = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string().nullable(),
  isPlatformAdmin: z.boolean(),
});
const usersResponse = z
  .object({ users: z.array(adminUser) })
  .openapi('AdminUsers');
const errorSchema = z.object({ error: z.string() }).openapi('AdminError');

/** Router del módulo admin. Acciones sensibles → gate de plataforma + auditoría. */
export function adminRouter() {
  const app = new OpenAPIHono<{ Variables: ApiVariables }>();
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
        401: {
          description: 'No autenticado',
          content: { 'application/json': { schema: errorSchema } },
        },
        403: {
          description: 'Prohibido',
          content: { 'application/json': { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const userId = c.get('userId');
      const db = c.get('db');
      if (!userId || !db) {
        return c.json({ error: 'No autenticado' }, 401);
      }
      if (!c.get('isPlatformAdmin')) {
        return c.json({ error: 'Prohibido' }, 403);
      }
      const users = await listUsers(db);
      await recordAudit(db, {
        actorId: userId,
        action: 'admin.users.list',
        metadata: { count: users.length },
      });
      return c.json({ users }, 200);
    },
  );
  return app;
}
