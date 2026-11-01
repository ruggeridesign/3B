import { type AppTransaction, and, eq, schema } from '@3b/db';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  type ApiVariables,
  canManageCatalog,
  isStoreMember,
  requireSession,
  sessionCtx,
} from '../../../http';
import { validateMovementQty } from '../domain/validate-movement';
import {
  applyMovement,
  listLevelsByItem,
  listMovements,
} from '../infra/inventory-repo';

const kind = z.enum(['receipt', 'sale', 'adjustment', 'return']);
const channel = z.enum(['online', 'counter', 'system']);

const levelOut = z
  .object({
    variantId: z.string(),
    onHand: z.number().int(),
    reserved: z.number().int(),
    available: z.number().int(),
    lowThreshold: z.number().int().nullable(),
    version: z.number().int(),
    updatedAt: z.string(),
  })
  .openapi('StockLevel');

const levelListOut = z
  .object({ levels: z.array(levelOut) })
  .openapi('StockLevelList');

const movementOut = z
  .object({
    id: z.string(),
    variantId: z.string(),
    kind,
    channel,
    qty: z.number().int(),
    reference: z.string().nullable(),
    idempotencyKey: z.string().nullable(),
    createdBy: z.string().nullable(),
    createdAt: z.string(),
  })
  .openapi('StockMovement');

const movementListOut = z
  .object({ movements: z.array(movementOut) })
  .openapi('StockMovementList');

const applyBody = z
  .object({
    kind,
    qty: z.number().int(),
    channel: channel.default('counter'),
    reference: z.string().max(200).optional(),
    idempotencyKey: z.string().max(100).optional(),
  })
  .openapi('ApplyStockMovement');

const errorSchema = z.object({ error: z.string() }).openapi('InventoryError');

const itemParam = z.object({
  id: z.string().openapi({ param: { name: 'id', in: 'path' } }),
  itemId: z.string().openapi({ param: { name: 'itemId', in: 'path' } }),
});
const variantParam = z.object({
  id: z.string().openapi({ param: { name: 'id', in: 'path' } }),
  itemId: z.string().openapi({ param: { name: 'itemId', in: 'path' } }),
  variantId: z.string().openapi({ param: { name: 'variantId', in: 'path' } }),
});

/**
 * Comprueba que la variante pertenece al ítem y el ítem a la tienda (consulta
 * propia para no acoplar inventory→catalog; la RLS igual acota). Devuelve si el
 * encadenamiento store→item→variant existe y es visible.
 */
async function variantInStore(
  db: AppTransaction,
  storeId: string,
  itemId: string,
  variantId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: schema.itemVariants.id })
    .from(schema.itemVariants)
    .innerJoin(schema.items, eq(schema.items.id, schema.itemVariants.itemId))
    .where(
      and(
        eq(schema.itemVariants.id, variantId),
        eq(schema.itemVariants.itemId, itemId),
        eq(schema.items.storeId, storeId),
      ),
    )
    .limit(1);
  return !!row;
}

/**
 * Router del módulo inventory. Rutas anidadas bajo la tienda/ítem/variante (como
 * catalog monta sus variantes). Ver stock = cualquier miembro; mover stock =
 * owner/admin/catalog.
 */
export function inventoryRouter() {
  const app = new OpenAPIHono<{ Variables: ApiVariables }>();
  app.use('*', requireSession);

  // Existencias de las variantes de un ítem. Cualquier miembro de la tienda.
  app.openapi(
    createRoute({
      method: 'get',
      path: '/stores/{id}/items/{itemId}/stock',
      tags: ['inventory'],
      summary: 'Existencias del ítem (por variante)',
      request: { params: itemParam },
      responses: {
        200: {
          description: 'OK',
          content: { 'application/json': { schema: levelListOut } },
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
      const { id, itemId } = c.req.valid('param');
      if (!(await isStoreMember(db, id))) {
        return c.json({ error: 'No sos miembro de esta tienda.' }, 403);
      }
      const levels = await listLevelsByItem(db, itemId);
      return c.json({ levels }, 200);
    },
  );

  // Libro de movimientos de una variante. Cualquier miembro de la tienda.
  app.openapi(
    createRoute({
      method: 'get',
      path: '/stores/{id}/items/{itemId}/variants/{variantId}/movements',
      tags: ['inventory'],
      summary: 'Movimientos de stock de la variante',
      request: { params: variantParam },
      responses: {
        200: {
          description: 'OK',
          content: { 'application/json': { schema: movementListOut } },
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
      const { id, variantId } = c.req.valid('param');
      if (!(await isStoreMember(db, id))) {
        return c.json({ error: 'No sos miembro de esta tienda.' }, 403);
      }
      const movements = await listMovements(db, variantId);
      return c.json({ movements }, 200);
    },
  );

  // Aplicar un movimiento (mostrador/ajuste). Solo owner/admin/catalog.
  app.openapi(
    createRoute({
      method: 'post',
      path: '/stores/{id}/items/{itemId}/variants/{variantId}/movements',
      tags: ['inventory'],
      summary: 'Aplicar un movimiento de stock',
      request: {
        params: variantParam,
        body: { content: { 'application/json': { schema: applyBody } } },
      },
      responses: {
        201: {
          description: 'Aplicado',
          content: { 'application/json': { schema: movementOut } },
        },
        400: {
          description: 'Movimiento inválido (signo/cantidad)',
          content: { 'application/json': { schema: errorSchema } },
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
          description: 'No existe esa variante en la tienda',
          content: { 'application/json': { schema: errorSchema } },
        },
        409: {
          description: 'Stock insuficiente',
          content: { 'application/json': { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const { db, userId } = sessionCtx(c);
      const { id, itemId, variantId } = c.req.valid('param');
      const body = c.req.valid('json');
      if (!(await canManageCatalog(db, id))) {
        return c.json(
          { error: 'No podés gestionar el catálogo de esta tienda.' },
          403,
        );
      }
      if (!(await variantInStore(db, id, itemId, variantId))) {
        return c.json({ error: 'No existe esa variante en la tienda.' }, 404);
      }
      const invalid = validateMovementQty(body.kind, body.qty);
      if (invalid) return c.json({ error: invalid }, 400);

      const res = await applyMovement(db, variantId, userId, body);
      if (res.status === 'insufficient') {
        return c.json(
          { error: `Stock insuficiente (disponible: ${res.onHand}).` },
          409,
        );
      }
      return c.json(res.movement, 201);
    },
  );

  return app;
}
