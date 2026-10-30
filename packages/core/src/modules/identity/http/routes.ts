import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { ApiVariables } from '../../../http';
import { readMe } from '../infra/identity-reader';

const capabilities = z.object({
  isMaker: z.literal(true),
  isSeller: z.boolean(),
  isMover: z.boolean(),
  isPlatformAdmin: z.boolean(),
});

const scope = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  role: z.string(),
});

const meSchema = z
  .object({
    user: z.object({
      id: z.string(),
      email: z.string(),
      name: z.string().nullable(),
    }),
    capabilities,
    communities: z.array(scope),
    stores: z.array(scope),
  })
  .openapi('Me');

const errorSchema = z.object({ error: z.string() }).openapi('Error');

/** Router del módulo identity. Requiere el middleware de auth de la API. */
export function meRouter() {
  const app = new OpenAPIHono<{ Variables: ApiVariables }>();
  app.openapi(
    createRoute({
      method: 'get',
      path: '/me',
      tags: ['identity'],
      summary: 'Usuario autenticado, capacidades y alcances',
      responses: {
        200: {
          description: 'OK',
          content: { 'application/json': { schema: meSchema } },
        },
        401: {
          description: 'No autenticado',
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
      const me = await readMe(db, userId);
      if (!me) {
        return c.json({ error: 'No autenticado' }, 401);
      }
      return c.json(me, 200);
    },
  );
  return app;
}
