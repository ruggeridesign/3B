import type { ServiceDetail, UpsertServiceDetailInput } from '@3b/contracts';
import { type AppTransaction, eq, schema } from '@3b/db';

type ServiceDetailRow = typeof schema.serviceDetails.$inferSelect;

function toServiceDetail(row: ServiceDetailRow): ServiceDetail {
  return {
    itemId: row.itemId,
    durationMin: row.durationMin,
    modality: row.modality as ServiceDetail['modality'],
    coverageKm: row.coverageKm,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Detalle de servicio de un ítem (null si no tiene; la RLS acota por el ítem). */
export async function getServiceDetail(
  db: AppTransaction,
  itemId: string,
): Promise<ServiceDetail | null> {
  const [row] = await db
    .select()
    .from(schema.serviceDetails)
    .where(eq(schema.serviceDetails.itemId, itemId));
  return row ? toServiceDetail(row) : null;
}

/**
 * Crea o actualiza el detalle de servicio de un ítem (upsert por `item_id`).
 * Los campos opcionales ausentes se guardan como null (reemplaza, no hace merge).
 */
export async function upsertServiceDetail(
  db: AppTransaction,
  itemId: string,
  input: UpsertServiceDetailInput,
): Promise<ServiceDetail> {
  const values = {
    itemId,
    durationMin: input.durationMin ?? null,
    modality: input.modality,
    coverageKm: input.coverageKm ?? null,
    notes: input.notes ?? null,
  };
  const [row] = await db
    .insert(schema.serviceDetails)
    .values(values)
    .onConflictDoUpdate({
      target: schema.serviceDetails.itemId,
      set: {
        durationMin: values.durationMin,
        modality: values.modality,
        coverageKm: values.coverageKm,
        notes: values.notes,
        updatedAt: new Date(),
      },
    })
    .returning();
  return toServiceDetail(row);
}

/** Borra el detalle de servicio. Devuelve si existía (y la RLS dejó borrarlo). */
export async function deleteServiceDetail(
  db: AppTransaction,
  itemId: string,
): Promise<boolean> {
  const rows = await db
    .delete(schema.serviceDetails)
    .where(eq(schema.serviceDetails.itemId, itemId))
    .returning({ itemId: schema.serviceDetails.itemId });
  return rows.length > 0;
}
