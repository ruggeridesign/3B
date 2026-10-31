import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { type ApiVariables, requireSession, sessionCtx } from '../../../http';
import { createStore, getStore, listMyStores } from '../infra/store-repo';

// Esquemas OpenAPI (reflejan los contratos de @3b/contracts; la web importa los
// tipos desde ahí). Se redeclaran acá con el `z` extendido para registrar los
// componentes del documento OpenAPI.
const kind = z.enum(['products', 'services']);
const status = z.enum(['active', 'suspended']);

const storeOut = z
  .object({
    id: z.string(),
    communityId: z.string(),
    ownerId: z.string(),
    kind,
    slug: z.string(),
    name: z.string(),
    status,
    createdAt: z.string(),
  })
  .openapi('Store');

const storeListOut = z
  .object({ stores: z.array(storeOut) })
  .openapi('StoreList');

const createBody = z
  .object({
    communityId: z
      .string()
      .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),
    kind,
    slug: z
      .string()
      .min(2)
      .max(40)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    name: z.string().min(2).max(80),
  })
  .openapi('CreateStore');

const errorSchema = z.object({ error: z.string() }).openapi('StoreError');

const idParam = z.object({
  id: z.string().openapi({ param: { name: 'id', in: 'path' } }),
});

/** Router del módulo store. Todas las rutas requieren sesión. */
export function storeRouter() {
  const app = new OpenAPIHono<{ Variables: ApiVariables }>();
  app.use('*', requireSession);

  // Abrir una tienda. El dueño es el usuario autenticado (nunca el cliente).
  app.openapi(
    createRoute({
      method: 'post',
      path: '/stores',
      tags: ['store'],
      summary: 'Abrir una tienda',
      request: {
        body: { content: { 'application/json': { schema: createBody } } },
      },
      responses: {
        201: {
          description: 'Creada',
          content: { 'application/json': { schema: storeOut } },
        },
        401: {
          description: 'No autenticado',
          content: { 'application/json': { schema: errorSchema } },
        },
        403: {
          description: 'Prohibido (no es miembro de la comunidad)',
          content: { 'application/json': { schema: errorSchema } },
        },
        409: {
          description: 'Slug en uso en la comunidad',
          content: { 'application/json': { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const { db, userId } = sessionCtx(c);
      const body = c.req.valid('json');
      // Los errores de RLS (403) o slug duplicado (409) los traduce el
      // `onError` central de la API (dbErrorResponse); dejamos propagar para
      // que la transacción del request haga rollback limpio.
      const store = await createStore(db, { ownerId: userId, ...body });
      return c.json(store, 201);
    },
  );

  // Mis tiendas (donde soy miembro).
  app.openapi(
    createRoute({
      method: 'get',
      path: '/stores/mine',
      tags: ['store'],
      summary: 'Tiendas del usuario autenticado',
      responses: {
        200: {
          description: 'OK',
          content: { 'application/json': { schema: storeListOut } },
        },
        401: {
          description: 'No autenticado',
          content: { 'application/json': { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const { db, userId } = sessionCtx(c);
      const stores = await listMyStores(db, userId);
      return c.json({ stores }, 200);
    },
  );

  // Una tienda por id (si la RLS la deja ver).
  app.openapi(
    createRoute({
      method: 'get',
      path: '/stores/{id}',
      tags: ['store'],
      summary: 'Detalle de una tienda',
      request: { params: idParam },
      responses: {
        200: {
          description: 'OK',
          content: { 'application/json': { schema: storeOut } },
        },
        401: {
          description: 'No autenticado',
          content: { 'application/json': { schema: errorSchema } },
        },
        404: {
          description: 'No encontrada',
          content: { 'application/json': { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const { db } = sessionCtx(c);
      const { id } = c.req.valid('param');
      const store = await getStore(db, id);
      if (!store) return c.json({ error: 'Tienda no encontrada' }, 404);
      return c.json(store, 200);
    },
  );

  return app;
}
