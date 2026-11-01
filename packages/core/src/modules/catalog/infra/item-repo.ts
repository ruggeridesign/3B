import type { CreateItemInput, Item, UpdateItemInput } from '@3b/contracts';
import { type AppTransaction, and, eq, schema, sql } from '@3b/db';

type ItemRow = typeof schema.items.$inferSelect;

/** Proyecta una fila de `catalog.items` al DTO público. */
function toItem(row: ItemRow): Item {
  return {
    id: row.id,
    storeId: row.storeId,
    communityId: row.communityId,
    categoryId: row.categoryId,
    kind: row.kind as Item['kind'],
    slug: row.slug,
    title: row.title,
    description: row.description,
    priceAmount: row.priceAmount,
    currency: row.currency,
    priceMode: row.priceMode as Item['priceMode'],
    status: row.status as Item['status'],
    attributes: (row.attributes as Item['attributes']) ?? {},
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

function itemWhere(storeId: string, id: string) {
  return and(eq(schema.items.storeId, storeId), eq(schema.items.id, id));
}

/** Un ítem por id dentro de una tienda (si la RLS lo deja ver). */
export async function getItem(
  db: AppTransaction,
  storeId: string,
  id: string,
): Promise<Item | null> {
  const [row] = await db
    .select()
    .from(schema.items)
    .where(itemWhere(storeId, id))
    .limit(1);
  return row ? toItem(row) : null;
}

/** Ítems de una tienda (la RLS acota: miembros ven todo; afuera, publicados). */
export async function listItemsByStore(
  db: AppTransaction,
  storeId: string,
): Promise<Item[]> {
  const rows = await db
    .select()
    .from(schema.items)
    .where(eq(schema.items.storeId, storeId))
    .orderBy(schema.items.createdAt);
  return rows.map(toItem);
}

/**
 * Crea un ítem. `community_id` lo fija el trigger `items_set_community` desde la
 * tienda (D-05), por eso no se envía. `published_at` se setea si nace publicado.
 */
export async function createItem(
  db: AppTransaction,
  input: { storeId: string } & CreateItemInput,
): Promise<Item> {
  const attributesJson = JSON.stringify(input.attributes ?? {});
  const rows = (await db.execute(sql`
    INSERT INTO catalog.items
      (store_id, category_id, kind, slug, title, description, price_amount, currency, price_mode, status, attributes, published_at)
    VALUES (
      ${input.storeId}, ${input.categoryId ?? null}, ${input.kind}, ${input.slug},
      ${input.title}, ${input.description ?? null}, ${input.priceAmount ?? null},
      ${input.currency}, ${input.priceMode}, ${input.status},
      ${attributesJson}::jsonb,
      CASE WHEN ${input.status}::text = 'published' THEN now() ELSE NULL END
    )
    RETURNING id
  `)) as unknown as Array<{ id: string }>;
  // Re-leemos con el builder para devolver el DTO completo (community del trigger).
  const item = await getItem(db, input.storeId, rows[0].id);
  // No puede ser null: lo acabamos de crear en esta transacción.
  return item as Item;
}

/** Edita parcialmente un ítem. Devuelve null si no existe (o la RLS lo oculta). */
export async function updateItem(
  db: AppTransaction,
  input: { storeId: string; id: string } & UpdateItemInput,
): Promise<Item | null> {
  const set: Partial<typeof schema.items.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (input.title !== undefined) set.title = input.title;
  if (input.description !== undefined) set.description = input.description;
  if (input.categoryId !== undefined) set.categoryId = input.categoryId;
  if (input.attributes !== undefined) set.attributes = input.attributes;
  if (input.priceAmount !== undefined) set.priceAmount = input.priceAmount;
  if (input.currency !== undefined) set.currency = input.currency;
  if (input.priceMode !== undefined) set.priceMode = input.priceMode;
  if (input.status !== undefined) {
    set.status = input.status;
    // Al publicar por primera vez, congelar published_at (si ya lo tenía, se respeta).
    if (input.status === 'published') {
      const current = await getItem(db, input.storeId, input.id);
      if (current && current.publishedAt === null) set.publishedAt = new Date();
    }
  }
  const [row] = await db
    .update(schema.items)
    .set(set)
    .where(itemWhere(input.storeId, input.id))
    .returning();
  return row ? toItem(row) : null;
}

/** Borra un ítem. Devuelve si existía (y la RLS dejó borrarlo). */
export async function deleteItem(
  db: AppTransaction,
  storeId: string,
  id: string,
): Promise<boolean> {
  const rows = await db
    .delete(schema.items)
    .where(itemWhere(storeId, id))
    .returning({ id: schema.items.id });
  return rows.length > 0;
}
