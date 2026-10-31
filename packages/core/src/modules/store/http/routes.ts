import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  type ApiVariables,
  canManageStore,
  isStoreMember,
  requireSession,
  sessionCtx,
} from '../../../http';
import {
  addStoreMember,
  createStore,
  findUserIdByEmail,
  getStore,
  listMyStores,
  listStoreMembers,
  removeStoreMember,
  updateStoreMemberRole,
} from '../infra/store-repo';

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

const memberParam = z.object({
  id: z.string().openapi({ param: { name: 'id', in: 'path' } }),
  userId: z.string().openapi({ param: { name: 'userId', in: 'path' } }),
});

const assignableRole = z.enum(['admin', 'catalog', 'sales']);

const memberOut = z
  .object({
    userId: z.string(),
    name: z.string().nullable(),
    email: z.string().nullable(),
    role: z.enum(['owner', 'admin', 'catalog', 'sales']),
    createdAt: z.string(),
  })
  .openapi('StoreMember');

const memberListOut = z
  .object({ members: z.array(memberOut) })
  .openapi('StoreMemberList');

const inviteBody = z
  .object({ email: z.string().email(), role: assignableRole })
  .openapi('InviteStoreMember');

const updateMemberBody = z
  .object({ role: assignableRole })
  .openapi('UpdateStoreMember');

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

  // ===== Equipo de la tienda =====

  // Ver el equipo. Cualquier miembro de la tienda (la RLS sm_select ya acota;
  // gateamos antes para una respuesta 403 temprana y clara).
  app.openapi(
    createRoute({
      method: 'get',
      path: '/stores/{id}/members',
      tags: ['store'],
      summary: 'Equipo de la tienda',
      request: { params: idParam },
      responses: {
        200: {
          description: 'OK',
          content: { 'application/json': { schema: memberListOut } },
        },
        401: {
          description: 'No autenticado',
          content: { 'application/json': { schema: errorSchema } },
        },
        403: {
          description: 'No sos miembro de la tienda',
          content: { 'application/json': { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const { db } = sessionCtx(c);
      const { id } = c.req.valid('param');
      if (!(await isStoreMember(db, id))) {
        return c.json({ error: 'No sos miembro de esta tienda.' }, 403);
      }
      const members = await listStoreMembers(db, id);
      return c.json({ members }, 200);
    },
  );

  // Invitar por email. Solo owner/admin. El invitado debe compartir una
  // comunidad (lo acota la RLS de users al resolver el email).
  app.openapi(
    createRoute({
      method: 'post',
      path: '/stores/{id}/members',
      tags: ['store'],
      summary: 'Invitar a alguien al equipo',
      request: {
        params: idParam,
        body: { content: { 'application/json': { schema: inviteBody } } },
      },
      responses: {
        201: {
          description: 'Agregado',
          content: { 'application/json': { schema: memberOut } },
        },
        401: {
          description: 'No autenticado',
          content: { 'application/json': { schema: errorSchema } },
        },
        403: {
          description: 'No podés administrar esta tienda',
          content: { 'application/json': { schema: errorSchema } },
        },
        404: {
          description: 'No se encontró a ese usuario',
          content: { 'application/json': { schema: errorSchema } },
        },
        409: {
          description: 'Ya es miembro del equipo',
          content: { 'application/json': { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const { db } = sessionCtx(c);
      const { id } = c.req.valid('param');
      const { email, role } = c.req.valid('json');
      if (!(await canManageStore(db, id))) {
        return c.json({ error: 'No podés administrar esta tienda.' }, 403);
      }
      const userId = await findUserIdByEmail(db, email);
      if (!userId) {
        return c.json(
          {
            error:
              'No encontramos un usuario con ese email en tus comunidades.',
          },
          404,
        );
      }
      // Un miembro repetido viola la PK (23505) → el onError central lo pasa a 409.
      const member = await addStoreMember(db, { storeId: id, userId, role });
      return c.json(member, 201);
    },
  );

  // Cambiar el rol de un miembro. Solo owner/admin; al dueño no se lo toca.
  app.openapi(
    createRoute({
      method: 'patch',
      path: '/stores/{id}/members/{userId}',
      tags: ['store'],
      summary: 'Cambiar el rol de un miembro',
      request: {
        params: memberParam,
        body: { content: { 'application/json': { schema: updateMemberBody } } },
      },
      responses: {
        200: {
          description: 'Actualizado',
          content: { 'application/json': { schema: memberOut } },
        },
        401: {
          description: 'No autenticado',
          content: { 'application/json': { schema: errorSchema } },
        },
        403: {
          description: 'No podés administrar esta tienda',
          content: { 'application/json': { schema: errorSchema } },
        },
        404: {
          description: 'No es miembro de esta tienda',
          content: { 'application/json': { schema: errorSchema } },
        },
        409: {
          description: 'No se puede cambiar el rol del dueño',
          content: { 'application/json': { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const { db } = sessionCtx(c);
      const { id, userId } = c.req.valid('param');
      const { role } = c.req.valid('json');
      if (!(await canManageStore(db, id))) {
        return c.json({ error: 'No podés administrar esta tienda.' }, 403);
      }
      const res = await updateStoreMemberRole(db, {
        storeId: id,
        userId,
        role,
      });
      if (res.status === 'not_found') {
        return c.json({ error: 'No es miembro de esta tienda.' }, 404);
      }
      if (res.status === 'owner_protected') {
        return c.json(
          { error: 'No se puede cambiar el rol del dueño de la tienda.' },
          409,
        );
      }
      return c.json(res.member, 200);
    },
  );

  // Quitar a un miembro. Solo owner/admin; al dueño no se lo quita.
  app.openapi(
    createRoute({
      method: 'delete',
      path: '/stores/{id}/members/{userId}',
      tags: ['store'],
      summary: 'Quitar a un miembro del equipo',
      request: { params: memberParam },
      responses: {
        204: { description: 'Quitado' },
        401: {
          description: 'No autenticado',
          content: { 'application/json': { schema: errorSchema } },
        },
        403: {
          description: 'No podés administrar esta tienda',
          content: { 'application/json': { schema: errorSchema } },
        },
        404: {
          description: 'No es miembro de esta tienda',
          content: { 'application/json': { schema: errorSchema } },
        },
        409: {
          description: 'No se puede quitar al dueño',
          content: { 'application/json': { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const { db } = sessionCtx(c);
      const { id, userId } = c.req.valid('param');
      if (!(await canManageStore(db, id))) {
        return c.json({ error: 'No podés administrar esta tienda.' }, 403);
      }
      const res = await removeStoreMember(db, { storeId: id, userId });
      if (res.status === 'not_found') {
        return c.json({ error: 'No es miembro de esta tienda.' }, 404);
      }
      if (res.status === 'owner_protected') {
        return c.json(
          { error: 'No se puede quitar al dueño de la tienda.' },
          409,
        );
      }
      return c.body(null, 204);
    },
  );

  return app;
}
