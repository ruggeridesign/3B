import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  type ApiVariables,
  canManageCatalog,
  isPlatformAdmin,
  requireSession,
  sessionCtx,
} from '../../../http';
import { createCategory, listCategories } from '../infra/category-repo';
import {
  createItem,
  deleteItem,
  listItemsByStore,
  updateItem,
} from '../infra/item-repo';

const kind = z.enum(['product', 'service']);
const status = z.enum(['draft', 'published', 'archived']);
const priceMode = z.enum(['fixed', 'from', 'quote']);
const money = z.string().regex(/^\d{1,10}(\.\d{1,2})?$/);
const currency = z.string().regex(/^[A-Z]{3}$/);
const uuid = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const slug = z
  .string()
  .min(2)
  .max(60)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const categoryKind = z.enum(['product', 'service', 'both']);

const categoryOut = z
  .object({
    id: z.string(),
    parentId: z.string().nullable(),
    name: z.string(),
    slug: z.string(),
    kind: categoryKind,
    createdAt: z.string(),
  })
  .openapi('Category');

const categoryListOut = z
  .object({ categories: z.array(categoryOut) })
  .openapi('CategoryList');

const createCategoryBody = z
  .object({
    name: z.string().min(2).max(80),
    slug,
    kind: categoryKind,
    parentId: uuid.nullable().optional(),
  })
  .openapi('CreateCategory');

const itemOut = z
  .object({
    id: z.string(),
    storeId: z.string(),
    communityId: z.string(),
    categoryId: z.string().nullable(),
    kind,
    slug: z.string(),
    title: z.string(),
    description: z.string().nullable(),
    priceAmount: z.string().nullable(),
    currency,
    priceMode,
    status,
    publishedAt: z.string().nullable(),
    createdAt: z.string(),
  })
  .openapi('Item');

const itemListOut = z.object({ items: z.array(itemOut) }).openapi('ItemList');

const createBody = z
  .object({
    kind,
    slug,
    title: z.string().min(2).max(120),
    description: z.string().max(4000).optional(),
    categoryId: uuid.nullable().optional(),
    priceAmount: money.optional(),
    currency: currency.default('USD'),
    priceMode: priceMode.default('fixed'),
    status: status.default('draft'),
  })
  .openapi('CreateItem');

const updateBody = z
  .object({
    title: z.string().min(2).max(120).optional(),
    description: z.string().max(4000).nullable().optional(),
    categoryId: uuid.nullable().optional(),
    priceAmount: money.nullable().optional(),
    currency: currency.optional(),
    priceMode: priceMode.optional(),
    status: status.optional(),
  })
  .openapi('UpdateItem');

const errorSchema = z.object({ error: z.string() }).openapi('CatalogError');

const storeParam = z.object({
  id: z.string().openapi({ param: { name: 'id', in: 'path' } }),
});
const itemParam = z.object({
  id: z.string().openapi({ param: { name: 'id', in: 'path' } }),
  itemId: z.string().openapi({ param: { name: 'itemId', in: 'path' } }),
});

/**
 * Router de catálogo. Vive en su propio módulo (propiedad de `catalog.items`),
 * pero expone rutas anidadas bajo `/stores/{id}/items` porque un ítem pertenece
 * a una tienda. Gestionar requiere el rol owner/admin/catalog.
 */
export function catalogRouter() {
  const app = new OpenAPIHono<{ Variables: ApiVariables }>();
  app.use('*', requireSession);

  // ===== Categorías (taxonomía global) =====

  // Listar todas las categorías (taxonomía pública para cualquier sesión).
  app.openapi(
    createRoute({
      method: 'get',
      path: '/categories',
      tags: ['catalog'],
      summary: 'Taxonomía de categorías',
      responses: {
        200: {
          description: 'OK',
          content: { 'application/json': { schema: categoryListOut } },
        },
        401: {
          description: 'No autenticado',
          content: { 'application/json': { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const { db } = sessionCtx(c);
      const categories = await listCategories(db);
      return c.json({ categories }, 200);
    },
  );

  // Crear una categoría. Solo admin de plataforma. parentId inexistente → 409.
  app.openapi(
    createRoute({
      method: 'post',
      path: '/categories',
      tags: ['catalog'],
      summary: 'Crear una categoría',
      request: {
        body: {
          content: { 'application/json': { schema: createCategoryBody } },
        },
      },
      responses: {
        201: {
          description: 'Creada',
          content: { 'application/json': { schema: categoryOut } },
        },
        401: {
          description: 'No autenticado',
          content: { 'application/json': { schema: errorSchema } },
        },
        403: {
          description: 'Solo el admin de plataforma',
          content: { 'application/json': { schema: errorSchema } },
        },
        409: {
          description: 'Slug en uso o parent inexistente',
          content: { 'application/json': { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const { db } = sessionCtx(c);
      const body = c.req.valid('json');
      if (!(await isPlatformAdmin(db))) {
        return c.json({ error: 'Solo el admin de plataforma.' }, 403);
      }
      const category = await createCategory(db, body);
      return c.json(category, 201);
    },
  );

  // Listar ítems de una tienda. La RLS acota (miembros ven todo; afuera, solo
  // publicados en comunidad visible), así que no gateamos de más acá.
  app.openapi(
    createRoute({
      method: 'get',
      path: '/stores/{id}/items',
      tags: ['catalog'],
      summary: 'Ítems de la tienda',
      request: { params: storeParam },
      responses: {
        200: {
          description: 'OK',
          content: { 'application/json': { schema: itemListOut } },
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
      const items = await listItemsByStore(db, id);
      return c.json({ items }, 200);
    },
  );

  // Crear un ítem. Solo owner/admin/catalog. Slug repetido → 409 (onError).
  app.openapi(
    createRoute({
      method: 'post',
      path: '/stores/{id}/items',
      tags: ['catalog'],
      summary: 'Crear un ítem',
      request: {
        params: storeParam,
        body: { content: { 'application/json': { schema: createBody } } },
      },
      responses: {
        201: {
          description: 'Creado',
          content: { 'application/json': { schema: itemOut } },
        },
        401: {
          description: 'No autenticado',
          content: { 'application/json': { schema: errorSchema } },
        },
        403: {
          description: 'No podés gestionar el catálogo de esta tienda',
          content: { 'application/json': { schema: errorSchema } },
        },
        409: {
          description: 'Slug en uso en la tienda',
          content: { 'application/json': { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const { db } = sessionCtx(c);
      const { id } = c.req.valid('param');
      const body = c.req.valid('json');
      if (!(await canManageCatalog(db, id))) {
        return c.json(
          { error: 'No podés gestionar el catálogo de esta tienda.' },
          403,
        );
      }
      const item = await createItem(db, { storeId: id, ...body });
      return c.json(item, 201);
    },
  );

  // Editar un ítem. Solo owner/admin/catalog.
  app.openapi(
    createRoute({
      method: 'patch',
      path: '/stores/{id}/items/{itemId}',
      tags: ['catalog'],
      summary: 'Editar un ítem',
      request: {
        params: itemParam,
        body: { content: { 'application/json': { schema: updateBody } } },
      },
      responses: {
        200: {
          description: 'Actualizado',
          content: { 'application/json': { schema: itemOut } },
        },
        401: {
          description: 'No autenticado',
          content: { 'application/json': { schema: errorSchema } },
        },
        403: {
          description: 'No podés gestionar el catálogo de esta tienda',
          content: { 'application/json': { schema: errorSchema } },
        },
        404: {
          description: 'No existe ese ítem',
          content: { 'application/json': { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const { db } = sessionCtx(c);
      const { id, itemId } = c.req.valid('param');
      const body = c.req.valid('json');
      if (!(await canManageCatalog(db, id))) {
        return c.json(
          { error: 'No podés gestionar el catálogo de esta tienda.' },
          403,
        );
      }
      const item = await updateItem(db, { storeId: id, id: itemId, ...body });
      if (!item) return c.json({ error: 'No existe ese ítem.' }, 404);
      return c.json(item, 200);
    },
  );

  // Borrar un ítem. Solo owner/admin/catalog.
  app.openapi(
    createRoute({
      method: 'delete',
      path: '/stores/{id}/items/{itemId}',
      tags: ['catalog'],
      summary: 'Borrar un ítem',
      request: { params: itemParam },
      responses: {
        204: { description: 'Borrado' },
        401: {
          description: 'No autenticado',
          content: { 'application/json': { schema: errorSchema } },
        },
        403: {
          description: 'No podés gestionar el catálogo de esta tienda',
          content: { 'application/json': { schema: errorSchema } },
        },
        404: {
          description: 'No existe ese ítem',
          content: { 'application/json': { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const { db } = sessionCtx(c);
      const { id, itemId } = c.req.valid('param');
      if (!(await canManageCatalog(db, id))) {
        return c.json(
          { error: 'No podés gestionar el catálogo de esta tienda.' },
          403,
        );
      }
      const existed = await deleteItem(db, id, itemId);
      if (!existed) return c.json({ error: 'No existe ese ítem.' }, 404);
      return c.body(null, 204);
    },
  );

  return app;
}
