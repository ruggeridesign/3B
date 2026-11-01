import { z } from 'zod';

/**
 * Contratos del módulo `inventory`. Rebanada 1: **existencias** (`stock_levels`,
 * proyección) + **movimientos** (`stock_movements`, libro de solo inserción).
 * Invariante: `available = on_hand - reserved`; todo cambio de stock nace de un
 * movimiento inmutable y la proyección la mantiene un trigger. Las **reservas**
 * (atadas a pedidos) y el **worker/Valkey** (vencimiento, `stock.changed`) llegan
 * en rebanadas siguientes.
 */

/** Tipo de movimiento de stock. El signo de `qty` se valida contra el tipo. */
export const StockMovementKind = z.enum([
  'receipt', // ingreso (+)
  'sale', // venta (−)
  'adjustment', // ajuste manual (±)
  'return', // devolución (+)
]);
export type StockMovementKind = z.infer<typeof StockMovementKind>;

/** Canal por el que ocurre el movimiento (mostrador, online, sistema). */
export const StockChannel = z.enum(['online', 'counter', 'system']);
export type StockChannel = z.infer<typeof StockChannel>;

/** Existencias de una variante (proyección). `available = on_hand - reserved`. */
export const StockLevel = z.object({
  variantId: z.string(),
  onHand: z.number().int(),
  reserved: z.number().int(),
  available: z.number().int(),
  lowThreshold: z.number().int().nullable(),
  version: z.number().int(),
  updatedAt: z.string(),
});
export type StockLevel = z.infer<typeof StockLevel>;

/** Existencias de las variantes de un ítem. */
export const StockLevelList = z.object({ levels: z.array(StockLevel) });
export type StockLevelList = z.infer<typeof StockLevelList>;

/** Un movimiento del libro (inmutable). `qty` es el delta con signo. */
export const StockMovement = z.object({
  id: z.string(),
  variantId: z.string(),
  kind: StockMovementKind,
  channel: StockChannel,
  qty: z.number().int(),
  reference: z.string().nullable(),
  idempotencyKey: z.string().nullable(),
  createdBy: z.string().nullable(),
  createdAt: z.string(),
});
export type StockMovement = z.infer<typeof StockMovement>;

/** Libro de movimientos de una variante. */
export const StockMovementList = z.object({
  movements: z.array(StockMovement),
});
export type StockMovementList = z.infer<typeof StockMovementList>;

/**
 * Aplicar un movimiento. `qty` es el delta con signo (debe ser ≠ 0 y su signo
 * coherente con `kind`; lo valida el dominio). `idempotencyKey` hace el POST
 * reintentable: con la misma clave se devuelve el movimiento ya aplicado.
 */
export const ApplyStockMovementInput = z.object({
  kind: StockMovementKind,
  qty: z.number().int(),
  channel: StockChannel.default('counter'),
  reference: z.string().max(200).optional(),
  idempotencyKey: z.string().max(100).optional(),
});
export type ApplyStockMovementInput = z.infer<typeof ApplyStockMovementInput>;
