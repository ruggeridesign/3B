import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { type ApiVariables, requireSession, sessionCtx } from '../../../http';
import {
  getPublicItem,
  getPublicStore,
  searchItems,
} from '../infra/discovery-repo';

/** Opciones del router de descubrimiento (config inyectada desde la app). */
export interface DiscoveryRouterOptions {
  /** Arma la URL pública de una media a partir de su `key` (storage de media). */
  mediaPublicUrl: (key: string) => string;
}

const kind = z.enum(['product', 'service']);
const priceMode = z.enum(['fixed', 'from', 'quote']);
const currency = z.string().regex(/^[A-Z]{3}$/);
const uuid = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

const discoveryItemOut = z
  .object({
    id: z.string(),
    storeId: z.string(),
    storeName: z.string(),
    storeSlug: z.string(),
    communityId: z.string(),
    communityName: z.string().nullable(),
    categoryId: z.string().nullable(),
    kind,
    slug: z.string(),
    title: z.string(),
    description: z.string().nullable(),
    priceAmount: z.string().nullable(),
    currency,
    priceMode,
    publishedAt: z.string().nullable(),
    createdAt: z.string(),
  })
  .openapi('DiscoveryItem');

const discoveryListOut = z
  .object({ items: z.array(discoveryItemOut), hasMore: z.boolean() })
  .openapi('DiscoveryItemList');

const serviceModality = z.enum(['in_store', 'on_site', 'remote']);
const attributeValues = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean()]),
);
const publicVariantOut = z.object({
  id: z.string(),
  sku: z.string(),
  axisValues: attributeValues,
  priceAmount: z.string().nullable(),
  available: z.number().int().nullable(),
});
const publicItemOut = z
  .object({
    id: z.string(),
    storeId: z.string(),
    storeName: z.string(),
    storeSlug: z.string(),
    storeVerified: z.boolean(),
    communityId: z.string(),
    communityName: z.string().nullable(),
    categoryId: z.string().nullable(),
    kind,
    slug: z.string(),
    title: z.string(),
    description: z.string().nullable(),
    priceAmount: z.string().nullable(),
    currency,
    priceMode,
    attributes: attributeValues,
    images: z.array(z.string()),
    variants: z.array(publicVariantOut),
    serviceDetail: z
      .object({
        durationMin: z.number().int().nullable(),
        modality: serviceModality,
        coverageKm: z.number().int().nullable(),
        notes: z.string().nullable(),
      })
      .nullable(),
    publishedAt: z.string().nullable(),
    createdAt: z.string(),
  })
  .openapi('PublicItem');

const storeKind = z.enum(['products', 'services']);
const hourOut = z.object({
  id: z.string(),
  storeId: z.string(),
  weekday: z.number().int(),
  opensMin: z.number().int(),
  closesMin: z.number().int(),
  createdAt: z.string(),
});
const publicStoreOut = z
  .object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
    kind: storeKind,
    verified: z.boolean(),
    communityId: z.string(),
    communityName: z.string().nullable(),
    hours: z.array(hourOut),
    items: z.array(discoveryItemOut),
  })
  .openapi('PublicStore');

const itemIdParam = z.object({
  id: z.string().openapi({ param: { name: 'id', in: 'path' } }),
});

// La query llega como strings; se coacciona a número/enum y se acotan límites.
const discoveryQuery = z.object({
  q: z.string().max(120).optional(),
  communityId: uuid.optional(),
  storeId: uuid.optional(),
  categoryId: uuid.optional(),
  kind: kind.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

const errorSchema = z.object({ error: z.string() }).openapi('DiscoveryError');

/**
 * Router de descubrimiento (feed + búsqueda). Vive en el módulo catalog (dueño de
 * `items`). Devuelve solo ítems publicados visibles para el usuario (la RLS acota
 * por comunidad; el repo filtra `status='published'`).
 */
export function discoveryRouter({ mediaPublicUrl }: DiscoveryRouterOptions) {
  const app = new OpenAPIHono<{ Variables: ApiVariables }>();
  app.use('*', requireSession);

  app.openapi(
    createRoute({
      method: 'get',
      path: '/discovery/items',
      tags: ['discovery'],
      summary: 'Feed/búsqueda de ítems publicados',
      request: { query: discoveryQuery },
      responses: {
        200: {
          description: 'OK',
          content: { 'application/json': { schema: discoveryListOut } },
        },
        401: {
          description: 'No autenticado',
          content: { 'application/json': { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const { db } = sessionCtx(c);
      const params = c.req.valid('query');
      const result = await searchItems(db, params);
      return c.json(result, 200);
    },
  );

  // Ficha pública de un ítem (solo si es visible: publicado + comunidad visible,
  // o miembro de la tienda). La RLS acota; 404 si no se ve.
  app.openapi(
    createRoute({
      method: 'get',
      path: '/discovery/items/{id}',
      tags: ['discovery'],
      summary: 'Ficha pública de un ítem',
      request: { params: itemIdParam },
      responses: {
        200: {
          description: 'OK',
          content: { 'application/json': { schema: publicItemOut } },
        },
        401: {
          description: 'No autenticado',
          content: { 'application/json': { schema: errorSchema } },
        },
        404: {
          description: 'No existe o no es visible',
          content: { 'application/json': { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const { db } = sessionCtx(c);
      const { id } = c.req.valid('param');
      const item = await getPublicItem(db, id, mediaPublicUrl);
      if (!item) return c.json({ error: 'No existe ese ítem.' }, 404);
      return c.json(item, 200);
    },
  );

  // Ficha pública de una tienda (storefront): cabecera + horario + publicados.
  app.openapi(
    createRoute({
      method: 'get',
      path: '/discovery/stores/{id}',
      tags: ['discovery'],
      summary: 'Ficha pública de una tienda',
      request: { params: itemIdParam },
      responses: {
        200: {
          description: 'OK',
          content: { 'application/json': { schema: publicStoreOut } },
        },
        401: {
          description: 'No autenticado',
          content: { 'application/json': { schema: errorSchema } },
        },
        404: {
          description: 'No existe o no es visible',
          content: { 'application/json': { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const { db } = sessionCtx(c);
      const { id } = c.req.valid('param');
      const store = await getPublicStore(db, id);
      if (!store) return c.json({ error: 'No existe esa tienda.' }, 404);
      return c.json(store, 200);
    },
  );

  return app;
}
