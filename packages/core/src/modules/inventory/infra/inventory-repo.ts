import type {
  ApplyStockMovementInput,
  StockLevel,
  StockMovement,
} from '@3b/contracts';
import { type AppTransaction, eq, schema } from '@3b/db';

type LevelRow = typeof schema.stockLevels.$inferSelect;
type MovementRow = typeof schema.stockMovements.$inferSelect;

function toLevel(row: LevelRow): StockLevel {
  return {
    variantId: row.variantId,
    onHand: row.onHand,
    reserved: row.reserved,
    available: row.onHand - row.reserved,
    lowThreshold: row.lowThreshold,
    version: row.version,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toMovement(row: MovementRow): StockMovement {
  return {
    id: row.id,
    variantId: row.variantId,
    kind: row.kind as StockMovement['kind'],
    channel: row.channel as StockMovement['channel'],
    qty: row.qty,
    reference: row.reference,
    idempotencyKey: row.idempotencyKey,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Existencias de una variante (o null si no tiene movimientos todavía). */
export async function getLevel(
  db: AppTransaction,
  variantId: string,
): Promise<StockLevel | null> {
  const [row] = await db
    .select()
    .from(schema.stockLevels)
    .where(eq(schema.stockLevels.variantId, variantId))
    .limit(1);
  return row ? toLevel(row) : null;
}

/** Existencias de las variantes de un ítem que ya tienen nivel. */
export async function listLevelsByItem(
  db: AppTransaction,
  itemId: string,
): Promise<StockLevel[]> {
  const rows = await db
    .select({ level: schema.stockLevels })
    .from(schema.stockLevels)
    .innerJoin(
      schema.itemVariants,
      eq(schema.itemVariants.id, schema.stockLevels.variantId),
    )
    .where(eq(schema.itemVariants.itemId, itemId))
    .orderBy(schema.itemVariants.sku);
  return rows.map((r) => toLevel(r.level));
}

/** Libro de movimientos de una variante (más reciente primero). */
export async function listMovements(
  db: AppTransaction,
  variantId: string,
): Promise<StockMovement[]> {
  const rows = await db
    .select()
    .from(schema.stockMovements)
    .where(eq(schema.stockMovements.variantId, variantId))
    .orderBy(schema.stockMovements.createdAt);
  return rows.map(toMovement).reverse();
}

/** Resultado de aplicar un movimiento (para mapear a HTTP sin 500). */
export type ApplyResult =
  | { status: 'ok'; movement: StockMovement; level: StockLevel }
  | { status: 'idempotent'; movement: StockMovement }
  | { status: 'insufficient'; onHand: number };

/**
 * Aplica un movimiento al libro; el trigger proyecta `stock_levels`. Idempotente
 * por `idempotencyKey` (si ya existe, devuelve el aplicado). Pre-chequea que no
 * se sobrevenda (on_hand + qty ≥ 0) devolviendo `insufficient` → 409; el CHECK de
 * la base es el candado final ante carreras.
 */
export async function applyMovement(
  db: AppTransaction,
  variantId: string,
  createdBy: string,
  input: ApplyStockMovementInput,
): Promise<ApplyResult> {
  // Idempotencia: misma clave ⇒ no se re-aplica.
  if (input.idempotencyKey) {
    const [existing] = await db
      .select()
      .from(schema.stockMovements)
      .where(eq(schema.stockMovements.idempotencyKey, input.idempotencyKey))
      .limit(1);
    if (existing)
      return { status: 'idempotent', movement: toMovement(existing) };
  }

  // No sobrevender: si el delta resta, el on_hand resultante no puede ser < 0.
  if (input.qty < 0) {
    const level = await getLevel(db, variantId);
    const onHand = level?.onHand ?? 0;
    if (onHand + input.qty < 0) return { status: 'insufficient', onHand };
  }

  const [row] = await db
    .insert(schema.stockMovements)
    .values({
      variantId,
      kind: input.kind,
      channel: input.channel,
      qty: input.qty,
      reference: input.reference ?? null,
      idempotencyKey: input.idempotencyKey ?? null,
      createdBy,
    })
    .returning();
  const movement = toMovement(row);
  // El trigger ya proyectó el nivel; lo leemos para devolverlo.
  const level = await getLevel(db, variantId);
  return { status: 'ok', movement, level: level as StockLevel };
}
