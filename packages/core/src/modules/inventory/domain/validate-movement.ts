import type { StockMovementKind } from '@3b/contracts';

/**
 * Valida que `qty` (delta con signo) sea coherente con el tipo de movimiento.
 * Función pura (capa domain), testeable sin DB. Devuelve el mensaje de error o
 * `null` si es válido.
 */
export function validateMovementQty(
  kind: StockMovementKind,
  qty: number,
): string | null {
  if (!Number.isInteger(qty) || qty === 0) {
    return 'La cantidad debe ser un entero distinto de cero.';
  }
  if ((kind === 'receipt' || kind === 'return') && qty <= 0) {
    return `Un movimiento "${kind}" debe sumar stock (qty > 0).`;
  }
  if (kind === 'sale' && qty >= 0) {
    return 'Un movimiento "sale" debe restar stock (qty < 0).';
  }
  // 'adjustment' admite cualquier signo (ya se validó ≠ 0).
  return null;
}
