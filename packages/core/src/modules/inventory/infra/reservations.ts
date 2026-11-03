import {
  type AppDatabase,
  type AppTransaction,
  and,
  eq,
  inArray,
  lt,
  schema,
} from '@3b/db';

/**
 * Reservas de stock atadas a un pedido (M5b, O-3/I-5). Reservar (al `aceptado`)
 * sube `reserved` de la variante vía el trigger de proyección; liberar (al
 * cancelar antes del envío) lo devuelve. Solo se reservan variantes con stock
 * **rastreado** (que ya tienen nivel); las no rastreadas (servicios, ítems sin
 * inventario) se ignoran. El `consumed` (venta real, descuento de `on_hand`)
 * llega con el flujo de entrega en M6.
 */

/** Una línea a reservar: variante + cantidad. */
export type ReserveLine = { variantId: string; qty: number };

/** Resultado de reservar (para mapear a HTTP sin 500). */
export type ReserveResult =
  | { status: 'ok'; reserved: number }
  | { status: 'insufficient'; variantId: string; available: number };

/** Minutos de vida por defecto de una reserva (I-5). La expiración automática la
 * aplicará el worker en una rebanada posterior; acá solo se deja el vencimiento. */
const DEFAULT_TTL_MIN = 30;

/**
 * Reserva stock para un pedido recién aceptado. Idempotente: si el pedido ya
 * tiene reservas activas no vuelve a reservar. Pre-chequea disponibilidad por
 * variante (`on_hand - reserved`) y, si falta para alguna, no reserva nada y
 * devuelve `insufficient` (→ 409). El trigger es el candado final ante carreras.
 */
export async function reserveForOrder(
  db: AppTransaction,
  orderId: string,
  lines: readonly ReserveLine[],
  opts: { ttlMinutes?: number } = {},
): Promise<ReserveResult> {
  // Idempotencia: si ya hay reservas activas para este pedido, no re-reserva.
  const [existing] = await db
    .select({ id: schema.reservations.id })
    .from(schema.reservations)
    .where(
      and(
        eq(schema.reservations.orderId, orderId),
        eq(schema.reservations.status, 'active'),
      ),
    )
    .limit(1);
  if (existing) return { status: 'ok', reserved: 0 };

  // Agrupar cantidades por variante (una variante puede venir en varias líneas).
  const needByVariant = new Map<string, number>();
  for (const l of lines) {
    needByVariant.set(
      l.variantId,
      (needByVariant.get(l.variantId) ?? 0) + l.qty,
    );
  }
  const variantIds = [...needByVariant.keys()];
  if (variantIds.length === 0) return { status: 'ok', reserved: 0 };

  // Niveles existentes = variantes con stock rastreado.
  const levels = await db
    .select({
      variantId: schema.stockLevels.variantId,
      onHand: schema.stockLevels.onHand,
      reserved: schema.stockLevels.reserved,
    })
    .from(schema.stockLevels)
    .where(inArray(schema.stockLevels.variantId, variantIds));
  const levelByVariant = new Map(levels.map((l) => [l.variantId, l]));

  const expiresAt = new Date(
    Date.now() + (opts.ttlMinutes ?? DEFAULT_TTL_MIN) * 60_000,
  );
  const toInsert: Array<typeof schema.reservations.$inferInsert> = [];
  for (const [variantId, qty] of needByVariant) {
    const lvl = levelByVariant.get(variantId);
    if (!lvl) continue; // variante sin stock rastreado → no se reserva
    const available = lvl.onHand - lvl.reserved;
    if (qty > available)
      return { status: 'insufficient', variantId, available };
    toInsert.push({ orderId, variantId, qty, status: 'active', expiresAt });
  }
  if (toInsert.length > 0) {
    await db.insert(schema.reservations).values(toInsert);
  }
  return { status: 'ok', reserved: toInsert.length };
}

/**
 * Libera las reservas activas de un pedido (al cancelar antes del envío). El
 * trigger devuelve `reserved`. Idempotente: si no hay activas, no hace nada.
 * Devuelve cuántas liberó.
 */
export async function releaseForOrder(
  db: AppTransaction,
  orderId: string,
): Promise<number> {
  const rows = await db
    .update(schema.reservations)
    .set({ status: 'released', updatedAt: new Date() })
    .where(
      and(
        eq(schema.reservations.orderId, orderId),
        eq(schema.reservations.status, 'active'),
      ),
    )
    .returning({ id: schema.reservations.id });
  return rows.length;
}

/** Resultado de un barrido de reservas vencidas. */
export type SweepResult = { released: number; variants: string[] };

/**
 * Libera las reservas **vencidas** (I-5): las `active` con `expires_at` en el
 * pasado pasan a `released` (el trigger devuelve `reserved`) y se emite un evento
 * `stock.changed` por variante afectada en el **outbox** (lo publicará el worker).
 * Es un **job de sistema**: corre con la conexión **owner** (sin contexto de
 * usuario), por eso toma la `AppDatabase` y abre su propia transacción (atómico).
 * Las reservas con `expires_at` nulo no vencen. Idempotente: si no hay vencidas,
 * no hace nada.
 */
export async function sweepExpiredReservations(
  db: AppDatabase,
): Promise<SweepResult> {
  return db.transaction(async (tx) => {
    const released = await tx
      .update(schema.reservations)
      .set({ status: 'released', updatedAt: new Date() })
      .where(
        and(
          eq(schema.reservations.status, 'active'),
          lt(schema.reservations.expiresAt, new Date()),
        ),
      )
      .returning({ variantId: schema.reservations.variantId });
    if (released.length === 0) return { released: 0, variants: [] };

    const variants = [...new Set(released.map((r) => r.variantId))];
    await tx.insert(schema.outbox).values(
      variants.map((variantId) => ({
        topic: 'stock.changed',
        payload: { variantId, reason: 'reservation_expired' },
      })),
    );
    return { released: released.length, variants };
  });
}
