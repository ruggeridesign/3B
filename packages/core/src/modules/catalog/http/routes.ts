import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  type ApiVariables,
  canManageCatalog,
  isPlatformAdmin,
  isStoreMember,
  requireSession,
  sessionCtx,
} from '../../../http';
import {
  createGlobalAttribute,
  createStoreAttribute,
  deleteAttribute,
  listStoreAttributes,
  resolveAttributes,
} from '../infra/attribute-repo';
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

// ----- Atributos -----
const attrScope = z.enum(['global', 'category', 'store']);
const attrDataType = z.enum(['text', 'number', 'boolean', 'enum']);
const attrKey = z
  .string()
  .min(2)
  .max(40)
  .regex(/^[a-z][a-z0-9_]*$/);

const attrOut = z
  .object({
    id: z.string(),
    scope: attrScope,
    scopeId: z.string().nullable(),
    key: z.string(),
    label: z.string(),
    dataType: attrDataType,
    options: z.array(z.string()).nullable(),
    unit: z.string().nullable(),
    filterable: z.boolean(),
    variantAxis: z.boolean(),
    createdAt: z.string(),
  })
  .openapi('AttributeDefinition');

const attrListOut = z
  .object({ attributes: z.array(attrOut) })
  .openapi('AttributeDefinitionList');

const attrFields = {
  key: attrKey,
  label: z.string().min(1).max(80),
  dataType: attrDataType,
  options: z.array(z.string().min(1)).optional(),
  unit: z.string().max(16).optional(),
  filterable: z.boolean().optional(),
  variantAxis: z.boolean().optional(),
};
const createStoreAttrBody = z
  .object(attrFields)
  .openapi('CreateStoreAttribute');
const createGlobalAttrBody = z
  .object({
    scope: z.enum(['global', 'category']),
    scopeId: uuid.nullable().optional(),
    ...attrFields,
  })
  .openapi('CreateGlobalAttribute');

const attrParam = z.object({
  id: z.string().openapi({ param: { name: 'id', in: 'path' } }),
  attrId: z.string().openapi({ param: { name: 'attrId', in: 'path' } }),
});
const resolvedQuery = z.object({ categoryId: uuid.optional() });

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

  // ===== Atributos =====

  // Crear una definición global o de categoría. Solo admin de plataforma.
  app.openapi(
    createRoute({
      method: 'post',
      path: '/attributes',
      tags: ['catalog'],
      summary: 'Crear un atributo global o de categoría',
      request: {
        body: {
          content: { 'application/json': { schema: createGlobalAttrBody } },
        },
      },
      responses: {
        201: {
          description: 'Creado',
          content: { 'application/json': { schema: attrOut } },
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
          description: 'Clave repetida en el alcance',
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
      const attr = await createGlobalAttribute(db, body);
      return c.json(attr, 201);
    },
  );

  // Definiciones de atributo propias de la tienda (scope=store).
  app.openapi(
    createRoute({
      method: 'get',
      path: '/stores/{id}/attributes',
      tags: ['catalog'],
      summary: 'Atributos propios de la tienda',
      request: { params: storeParam },
      responses: {
        200: {
          description: 'OK',
          content: { 'application/json': { schema: attrListOut } },
        },
        401: {
          description: 'No autenticado',
          content: { 'application/json': { schema: errorSchema } },
        },
        403: {
          description: 'No podés gestionar el catálogo de esta tienda',
          content: { 'application/json': { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const { db } = sessionCtx(c);
      const { id } = c.req.valid('param');
      if (!(await canManageCatalog(db, id))) {
        return c.json(
          { error: 'No podés gestionar el catálogo de esta tienda.' },
          403,
        );
      }
      const attributes = await listStoreAttributes(db, id);
      return c.json({ attributes }, 200);
    },
  );

  // Crear un atributo con alcance de tienda. Solo owner/admin/catalog.
  app.openapi(
    createRoute({
      method: 'post',
      path: '/stores/{id}/attributes',
      tags: ['catalog'],
      summary: 'Crear un atributo de la tienda',
      request: {
        params: storeParam,
        body: {
          content: { 'application/json': { schema: createStoreAttrBody } },
        },
      },
      responses: {
        201: {
          description: 'Creado',
          content: { 'application/json': { schema: attrOut } },
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
          description: 'Clave repetida en la tienda',
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
      const attr = await createStoreAttribute(db, id, body);
      return c.json(attr, 201);
    },
  );

  // Atributos RESUELTOS por herencia (global + categoría+ancestros + tienda).
  app.openapi(
    createRoute({
      method: 'get',
      path: '/stores/{id}/attributes/resolved',
      tags: ['catalog'],
      summary: 'Atributos aplicables (herencia) a la tienda/categoría',
      request: { params: storeParam, query: resolvedQuery },
      responses: {
        200: {
          description: 'OK',
          content: { 'application/json': { schema: attrListOut } },
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
      const { categoryId } = c.req.valid('query');
      if (!(await isStoreMember(db, id))) {
        return c.json({ error: 'No sos miembro de esta tienda.' }, 403);
      }
      const attributes = await resolveAttributes(db, id, categoryId ?? null);
      return c.json({ attributes }, 200);
    },
  );

  // Borrar una definición de atributo. La RLS gatea por alcance.
  app.openapi(
    createRoute({
      method: 'delete',
      path: '/stores/{id}/attributes/{attrId}',
      tags: ['catalog'],
      summary: 'Borrar un atributo de la tienda',
      request: { params: attrParam },
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
          description: 'No existe ese atributo',
          content: { 'application/json': { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const { db } = sessionCtx(c);
      const { id, attrId } = c.req.valid('param');
      if (!(await canManageCatalog(db, id))) {
        return c.json(
          { error: 'No podés gestionar el catálogo de esta tienda.' },
          403,
        );
      }
      const existed = await deleteAttribute(db, attrId);
      if (!existed) return c.json({ error: 'No existe ese atributo.' }, 404);
      return c.body(null, 204);
    },
  );

  return app;
}
