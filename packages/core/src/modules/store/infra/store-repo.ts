import type { Store } from '@3b/contracts';
import { type AppTransaction, eq, schema } from '@3b/db';

type StoreRow = typeof schema.stores.$inferSelect;

/** Proyecta una fila de `store.stores` al DTO público. */
function toStore(row: StoreRow): Store {
  return {
    id: row.id,
    communityId: row.communityId,
    ownerId: row.ownerId,
    kind: row.kind as Store['kind'],
    slug: row.slug,
    name: row.name,
    status: row.status as Store['status'],
    createdAt: row.createdAt.toISOString(),
  };
}

export interface NewStore {
  ownerId: string;
  communityId: string;
  kind: Store['kind'];
  slug: string;
  name: string;
}

/**
 * Crea una tienda. La RLS exige `owner_id = usuario actual` y que sea miembro de
 * la comunidad. El trigger `stores_owner_membership` crea la membresía `owner`
 * en la MISMA transacción (ver migración 0005).
 */
export async function createStore(
  db: AppTransaction,
  input: NewStore,
): Promise<Store> {
  const [row] = await db
    .insert(schema.stores)
    .values({
      ownerId: input.ownerId,
      communityId: input.communityId,
      kind: input.kind,
      slug: input.slug,
      name: input.name,
    })
    .returning();
  return toStore(row);
}

/** Tiendas donde el usuario es miembro (cualquier rol). Capacidad Seller. */
export async function listMyStores(
  db: AppTransaction,
  userId: string,
): Promise<Store[]> {
  const rows = await db
    .select()
    .from(schema.stores)
    .innerJoin(
      schema.storeMembers,
      eq(schema.storeMembers.storeId, schema.stores.id),
    )
    .where(eq(schema.storeMembers.userId, userId));
  return rows.map((r) => toStore(r.stores));
}

/** Una tienda por id, si la RLS la deja ver (miembro, admin o comunidad visible). */
export async function getStore(
  db: AppTransaction,
  id: string,
): Promise<Store | null> {
  const [row] = await db
    .select()
    .from(schema.stores)
    .where(eq(schema.stores.id, id))
    .limit(1);
  return row ? toStore(row) : null;
}
