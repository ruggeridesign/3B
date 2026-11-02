import {
  ORDER_TRANSITIONS,
  type OrderActor,
  type OrderStatus,
  type OrderTransition,
} from '@3b/contracts';

/**
 * Máquina de estados del pedido, **pura** (sin DB). Opera sobre la tabla
 * `ORDER_TRANSITIONS` de `@3b/contracts` (fuente única, §6 del modelo). Valida
 * aristas, lista próximos estados y traduce cada transición a su **efecto sobre
 * el stock** (reservar / liberar / consumir). La reserva/liberación se cablean en
 * M5b; el consumo (venta) queda para el flujo de entrega (M6).
 */

/** Efecto de una transición sobre el inventario. */
export type StockEffect = 'reserve' | 'release' | 'consume' | 'none';

/** La arista `from → to` si existe en la máquina, o `undefined`. */
export function findTransition(
  from: OrderStatus,
  to: OrderStatus,
): OrderTransition | undefined {
  return ORDER_TRANSITIONS.find((t) => t.from === from && t.to === to);
}

/** ¿Es `from → to` una transición válida de la máquina? */
export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return findTransition(from, to) !== undefined;
}

/** Transiciones salientes de un estado (todas las aristas desde `from`). */
export function nextStatuses(from: OrderStatus): OrderTransition[] {
  return ORDER_TRANSITIONS.filter((t) => t.from === from);
}

/** Transiciones salientes de `from` que dispara un actor dado. */
export function transitionsFor(
  from: OrderStatus,
  by: OrderActor,
): OrderTransition[] {
  return nextStatuses(from).filter((t) => t.by === by);
}

/**
 * Efecto sobre el stock de **entrar** a un estado. `aceptado` reserva; los
 * estados que terminan el pedido antes del envío (`cancelado`, `rechazado`,
 * `expirado`, `pago_rechazado`) liberan (no-op si no había reserva); la entrega
 * (`retirado`/`entregado`) consume. El resto no toca inventario.
 */
export function stockEffect(to: OrderStatus): StockEffect {
  if (to === 'aceptado') return 'reserve';
  if (to === 'retirado' || to === 'entregado') return 'consume';
  if (
    to === 'cancelado' ||
    to === 'rechazado' ||
    to === 'expirado' ||
    to === 'pago_rechazado'
  ) {
    return 'release';
  }
  return 'none';
}
