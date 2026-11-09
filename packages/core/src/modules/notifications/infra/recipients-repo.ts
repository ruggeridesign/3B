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

/** Datos de un pedido para componer avisos (comprador, tienda, número). null si no existe. */
export async function orderBrief(
  db: Db,
  orderId: string,
): Promise<{ buyerId: string; storeId: string; number: number } | null> {
  const [row] = await db
    .select({
      buyerId: schema.orderRecords.makerId,
      storeId: schema.orderRecords.storeId,
      number: schema.orderRecords.number,
    })
    .from(schema.orderRecords)
    .where(eq(schema.orderRecords.id, orderId))
    .limit(1);
  return row ?? null;
}

/** Contexto de una conversación (`order`/`context_id`). null si no existe. */
export async function conversationContext(
  db: Db,
  conversationId: string,
): Promise<{ context: string; contextId: string } | null> {
  const [row] = await db
    .select({
      context: schema.conversations.context,
      contextId: schema.conversations.contextId,
    })
    .from(schema.conversations)
    .where(eq(schema.conversations.id, conversationId))
    .limit(1);
  return row ?? null;
}
