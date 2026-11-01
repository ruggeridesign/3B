import type { CreateStoreHourInput, StoreHour } from '@3b/contracts';
import { type AppTransaction, and, eq, schema } from '@3b/db';

type StoreHourRow = typeof schema.storeHours.$inferSelect;

function toStoreHour(row: StoreHourRow): StoreHour {
  return {
    id: row.id,
    storeId: row.storeId,
    weekday: row.weekday,
    opensMin: row.opensMin,
    closesMin: row.closesMin,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Intervalos de horario de una tienda, ordenados por día y apertura. */
export async function listStoreHours(
  db: AppTransaction,
  storeId: string,
): Promise<StoreHour[]> {
  const rows = await db
    .select()
    .from(schema.storeHours)
    .where(eq(schema.storeHours.storeId, storeId))
    .orderBy(schema.storeHours.weekday, schema.storeHours.opensMin);
  return rows.map(toStoreHour);
}

/** Crea un intervalo. Tramo repetido (mismo día/apertura) → 23505 → 409. */
export async function createStoreHour(
  db: AppTransaction,
  input: { storeId: string } & CreateStoreHourInput,
): Promise<StoreHour> {
  const [row] = await db
    .insert(schema.storeHours)
    .values({
      storeId: input.storeId,
      weekday: input.weekday,
      opensMin: input.opensMin,
      closesMin: input.closesMin,
    })
    .returning();
  return toStoreHour(row);
}

/** Borra un intervalo. Devuelve si existía (y la RLS dejó borrarlo). */
export async function deleteStoreHour(
  db: AppTransaction,
  storeId: string,
  id: string,
): Promise<boolean> {
  const rows = await db
    .delete(schema.storeHours)
    .where(
      and(eq(schema.storeHours.storeId, storeId), eq(schema.storeHours.id, id)),
    )
    .returning({ id: schema.storeHours.id });
  return rows.length > 0;
}
