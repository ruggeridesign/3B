import type { Order } from '@3b/contracts';
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
