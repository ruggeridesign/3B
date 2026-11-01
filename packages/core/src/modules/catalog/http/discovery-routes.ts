import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { type ApiVariables, requireSession, sessionCtx } from '../../../http';
import { searchItems } from '../infra/discovery-repo';

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

// La query llega como strings; se coacciona a número/enum y se acotan límites.
const discoveryQuery = z.object({
  q: z.string().max(120).optional(),
  communityId: uuid.optional(),
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
export function discoveryRouter() {
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

  return app;
}
