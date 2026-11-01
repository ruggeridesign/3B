import type {
  CreateVariantInput,
  ItemVariant,
  UpdateVariantInput,
} from '@3b/contracts';
import { type AppTransaction, and, eq, schema } from '@3b/db';

type VariantRow = typeof schema.itemVariants.$inferSelect;

function toVariant(row: VariantRow): ItemVariant {
  return {
    id: row.id,
    itemId: row.itemId,
    sku: row.sku,
    barcode: row.barcode,
    axisValues: (row.axisValues as ItemVariant['axisValues']) ?? {},
    priceAmount: row.priceAmount,
    trackStock: row.trackStock,
    createdAt: row.createdAt.toISOString(),
  };
}

function variantWhere(itemId: string, id: string) {
  return and(
    eq(schema.itemVariants.itemId, itemId),
    eq(schema.itemVariants.id, id),
  );
}

/** Variantes de un ítem (la RLS acota por visibilidad del ítem padre). */
export async function listVariants(
  db: AppTransaction,
  itemId: string,
): Promise<ItemVariant[]> {
  const rows = await db
    .select()
    .from(schema.itemVariants)
    .where(eq(schema.itemVariants.itemId, itemId))
    .orderBy(schema.itemVariants.sku);
  return rows.map(toVariant);
}

/** Crea una variante. SKU repetido por ítem → 23505 → 409 (onError). */
export async function createVariant(
  db: AppTransaction,
  itemId: string,
  input: CreateVariantInput,
): Promise<ItemVariant> {
  const [row] = await db
    .insert(schema.itemVariants)
    .values({
      itemId,
      sku: input.sku,
      barcode: input.barcode ?? null,
      axisValues: input.axisValues ?? {},
      priceAmount: input.priceAmount ?? null,
      trackStock: input.trackStock ?? false,
    })
    .returning();
  return toVariant(row);
}

/** Edita parcialmente una variante. null si no existe (o la RLS la oculta). */
export async function updateVariant(
  db: AppTransaction,
  itemId: string,
  id: string,
  input: UpdateVariantInput,
): Promise<ItemVariant | null> {
  const set: Partial<typeof schema.itemVariants.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (input.barcode !== undefined) set.barcode = input.barcode;
  if (input.axisValues !== undefined) set.axisValues = input.axisValues;
  if (input.priceAmount !== undefined) set.priceAmount = input.priceAmount;
  if (input.trackStock !== undefined) set.trackStock = input.trackStock;
  const [row] = await db
    .update(schema.itemVariants)
    .set(set)
    .where(variantWhere(itemId, id))
    .returning();
  return row ? toVariant(row) : null;
}

/** Borra una variante. Devuelve si existía (y la RLS dejó borrarla). */
export async function deleteVariant(
  db: AppTransaction,
  itemId: string,
  id: string,
): Promise<boolean> {
  const rows = await db
    .delete(schema.itemVariants)
    .where(variantWhere(itemId, id))
    .returning({ id: schema.itemVariants.id });
  return rows.length > 0;
}
