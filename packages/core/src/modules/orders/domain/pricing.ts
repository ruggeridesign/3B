/**
 * Cálculo de montos del pedido, **puro** (sin DB ni dinero flotante). Trabaja en
 * **centavos enteros** para evitar errores de coma flotante y devuelve strings
 * `numeric(12,2)`. Un pedido = una sola moneda (lo garantiza `computeTotals`).
 */

/** "12.34" | "12.3" | "12" → 1234 centavos. Lanza si el formato no es válido. */
export function toCents(amount: string): number {
  const m = /^(\d{1,10})(?:\.(\d{1,2}))?$/.exec(amount.trim());
  if (!m) throw new Error(`Monto inválido: ${amount}`);
  const whole = Number.parseInt(m[1] as string, 10);
  const frac = ((m[2] ?? '') + '00').slice(0, 2);
  return whole * 100 + Number.parseInt(frac, 10);
}

/** 1234 → "12.34". Redondea hacia 0 (los centavos ya son enteros). */
export function fromCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(Math.trunc(cents));
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/** Total de una línea = precio unitario × cantidad (en centavos). */
export function lineTotalCents(unitPrice: string, qty: number): number {
  if (!Number.isInteger(qty) || qty <= 0) {
    throw new Error(`Cantidad inválida: ${qty}`);
  }
  return toCents(unitPrice) * qty;
}

export interface PriceLine {
  unitPrice: string;
  currency: string;
  qty: number;
}

export interface OrderTotals {
  currency: string;
  lineTotals: string[]; // alineado 1:1 con las líneas de entrada
  subtotal: string;
  total: string;
}

/**
 * Calcula subtotal (Σ líneas) y total (+ envío + comisión) de un pedido de una
 * sola moneda. `shipping`/`fee` por defecto en 0 (M5a: envío llega en M6, comisión
 * en M7). Lanza si las líneas mezclan monedas o la lista está vacía.
 */
export function computeTotals(
  lines: readonly PriceLine[],
  opts: { shipping?: string; fee?: string } = {},
): OrderTotals {
  if (lines.length === 0) throw new Error('El pedido no tiene líneas.');
  const currency = lines[0]?.currency as string;
  if (lines.some((l) => l.currency !== currency)) {
    throw new Error('Todas las líneas deben compartir la misma moneda.');
  }
  const lineCents = lines.map((l) => lineTotalCents(l.unitPrice, l.qty));
  const subtotal = lineCents.reduce((a, b) => a + b, 0);
  const shipping = opts.shipping ? toCents(opts.shipping) : 0;
  const fee = opts.fee ? toCents(opts.fee) : 0;
  return {
    currency,
    lineTotals: lineCents.map(fromCents),
    subtotal: fromCents(subtotal),
    total: fromCents(subtotal + shipping + fee),
  };
}
