import type {
  AddCollectionItemInput,
  Collection,
  CollectionItemRef,
  CreateCollectionInput,
  UpdateCollectionInput,
} from '@3b/contracts';
import { type AppTransaction, and, eq, inArray, schema } from '@3b/db';

type CollectionRow = typeof schema.collections.$inferSelect;

function toCollection(
  row: CollectionRow,
  items: CollectionItemRef[],
): Collection {
  return {
    id: row.id,
    storeId: row.storeId,
    title: row.title,
    position: row.position,
    items,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Colecciones de una tienda con sus ítems embebidos (ordenados por posición).
 * Dos consultas (colecciones + sus pertenencias) agrupadas en memoria: evita un
 * N+1 y deja a la RLS acotar ambas (una pertenencia se ve si se ve su colección).
 */
export async function listCollections(
  db: AppTransaction,
  storeId: string,
): Promise<Collection[]> {
  const cols = await db
    .select()
    .from(schema.collections)
    .where(eq(schema.collections.storeId, storeId))
    .orderBy(schema.collections.position, schema.collections.title);
  if (cols.length === 0) return [];

  const rows = await db
    .select()
    .from(schema.collectionItems)
    .where(
      inArray(
        schema.collectionItems.collectionId,
        cols.map((c) => c.id),
      ),
    )
    .orderBy(schema.collectionItems.position, schema.collectionItems.itemId);

  const byCollection = new Map<string, CollectionItemRef[]>();
  for (const r of rows) {
    const list = byCollection.get(r.collectionId) ?? [];
    list.push({ itemId: r.itemId, position: r.position });
    byCollection.set(r.collectionId, list);
  }
  return cols.map((c) => toCollection(c, byCollection.get(c.id) ?? []));
}

/** Una colección por id dentro de una tienda (o null si no existe/RLS). */
export async function getCollection(
  db: AppTransaction,
  storeId: string,
  id: string,
): Promise<Collection | null> {
  const [row] = await db
    .select()
    .from(schema.collections)
    .where(
      and(
        eq(schema.collections.storeId, storeId),
        eq(schema.collections.id, id),
      ),
    )
    .limit(1);
  if (!row) return null;
  const rows = await db
    .select()
    .from(schema.collectionItems)
    .where(eq(schema.collectionItems.collectionId, id))
    .orderBy(schema.collectionItems.position, schema.collectionItems.itemId);
  return toCollection(
    row,
    rows.map((r) => ({ itemId: r.itemId, position: r.position })),
  );
}

/** Crea una colección (vacía). Título repetido por tienda → 23505 → 409. */
export async function createCollection(
  db: AppTransaction,
  input: { storeId: string } & CreateCollectionInput,
): Promise<Collection> {
  const [row] = await db
    .insert(schema.collections)
    .values({
      storeId: input.storeId,
      title: input.title,
      position: input.position ?? 0,
    })
    .returning();
  return toCollection(row, []);
}

/** Edita parcialmente una colección. null si no existe (o la RLS la oculta). */
export async function updateCollection(
  db: AppTransaction,
  storeId: string,
  id: string,
  input: UpdateCollectionInput,
): Promise<Collection | null> {
  const set: Partial<typeof schema.collections.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (input.title !== undefined) set.title = input.title;
  if (input.position !== undefined) set.position = input.position;
  const [row] = await db
    .update(schema.collections)
    .set(set)
    .where(
      and(
        eq(schema.collections.storeId, storeId),
        eq(schema.collections.id, id),
      ),
    )
    .returning();
  if (!row) return null;
  return getCollection(db, storeId, id);
}

/** Borra una colección (y en cascada sus pertenencias). Devuelve si existía. */
export async function deleteCollection(
  db: AppTransaction,
  storeId: string,
  id: string,
): Promise<boolean> {
  const rows = await db
    .delete(schema.collections)
    .where(
      and(
        eq(schema.collections.storeId, storeId),
        eq(schema.collections.id, id),
      ),
    )
    .returning({ id: schema.collections.id });
  return rows.length > 0;
}

/** Agrega un ítem a una colección. Ítem ya presente → 23505 → 409. */
export async function addCollectionItem(
  db: AppTransaction,
  collectionId: string,
  input: AddCollectionItemInput,
): Promise<CollectionItemRef> {
  const [row] = await db
    .insert(schema.collectionItems)
    .values({
      collectionId,
      itemId: input.itemId,
      position: input.position ?? 0,
    })
    .returning();
  return { itemId: row.itemId, position: row.position };
}

/** Quita un ítem de una colección. Devuelve si estaba (y la RLS dejó borrarlo). */
export async function removeCollectionItem(
  db: AppTransaction,
  collectionId: string,
  itemId: string,
): Promise<boolean> {
  const rows = await db
    .delete(schema.collectionItems)
    .where(
      and(
        eq(schema.collectionItems.collectionId, collectionId),
        eq(schema.collectionItems.itemId, itemId),
      ),
    )
    .returning({ itemId: schema.collectionItems.itemId });
  return rows.length > 0;
}
