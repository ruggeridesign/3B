import { type AppDatabase, type AppTransaction, eq, schema } from '@3b/db';

/** Conexión con capacidad de leer (worker: owner; http: tx RLS). */
type Db = AppDatabase | AppTransaction;

/**
 * Ids de usuario de los miembros de una tienda — destinatarios de los avisos de
 * tienda (p. ej. un pedido nuevo). Lee la tabla compartida `store.store_members`.
 */
export async function storeMemberIds(
  db: Db,
  storeId: string,
): Promise<string[]> {
  const rows = await db
    .select({ userId: schema.storeMembers.userId })
    .from(schema.storeMembers)
    .where(eq(schema.storeMembers.storeId, storeId));
  return rows.map((r) => r.userId);
}
