import { ORDER_TRANSITIONS, type Order, type OrderStatus } from '@3b/contracts';
import { cookies } from 'next/headers';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787';

/** Etiqueta legible del estado del pedido (compartida por las pantallas). */
export const ORDER_STATUS_LABEL: Record<Order['status'], string> = {
  realizado: 'Realizado',
  aceptado: 'Aceptado',
  rechazado: 'Rechazado',
  expirado: 'Expirado',
  pago_reportado: 'Pago reportado',
  pago_confirmado: 'Pago confirmado',
  pago_rechazado: 'Pago rechazado',
  en_preparacion: 'En preparación',
  listo: 'Listo',
  retirado: 'Retirado',
  en_envio: 'En envío',
  entregado: 'Entregado',
  completado: 'Completado',
  en_disputa: 'En disputa',
  cancelado: 'Cancelado',
};

async function cookieHeader(): Promise<string> {
  return (await cookies()).toString();
}

/** Mis pedidos (como comprador). [] si no hay sesión o falla. */
export async function getMyOrders(): Promise<Order[]> {
  const cookie = await cookieHeader();
  if (!cookie) return [];
  try {
    const res = await fetch(`${API}/v1/orders`, {
      headers: { cookie },
      cache: 'no-store',
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { orders: Order[] };
    return data.orders;
  } catch {
    return [];
  }
}

/** Pedidos recibidos por una tienda (solo miembros). [] si no hay sesión o falla. */
export async function getStoreOrders(storeId: string): Promise<Order[]> {
  const cookie = await cookieHeader();
  if (!cookie) return [];
  try {
    const res = await fetch(`${API}/v1/stores/${storeId}/orders`, {
      headers: { cookie },
      cache: 'no-store',
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { orders: Order[] };
    return data.orders;
  } catch {
    return [];
  }
}

/** Una acción de transición ofrecida en la UI (estado destino + etiqueta). */
export type OrderAction = { toStatus: OrderStatus; label: string };

/** Estados a los que la UI puede mover un pedido en M5b (espeja el API). */
const M5B_ENABLED = new Set<OrderStatus>([
  'aceptado',
  'rechazado',
  'listo',
  'cancelado',
]);

const ACTION_LABEL: Partial<Record<OrderStatus, string>> = {
  aceptado: 'Aceptar',
  rechazado: 'Rechazar',
  listo: 'Marcar listo',
  cancelado: 'Cancelar',
};

/**
 * Acciones disponibles desde `status` para un rol (`seller` = miembro de la
 * tienda; `maker` = comprador), según la máquina de estados (§6) y lo habilitado
 * en M5b. Se deriva de `ORDER_TRANSITIONS` (fuente única).
 */
export function orderActions(
  status: OrderStatus,
  role: 'seller' | 'maker',
): OrderAction[] {
  return ORDER_TRANSITIONS.filter(
    (t) => t.from === status && t.by === role && M5B_ENABLED.has(t.to),
  ).map((t) => ({ toStatus: t.to, label: ACTION_LABEL[t.to] ?? t.to }));
}

/** Detalle de un pedido (Maker dueño o miembro de la tienda). null si falla. */
export async function getOrder(id: string): Promise<Order | null> {
  const cookie = await cookieHeader();
  if (!cookie) return null;
  try {
    const res = await fetch(`${API}/v1/orders/${id}`, {
      headers: { cookie },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as Order;
  } catch {
    return null;
  }
}
