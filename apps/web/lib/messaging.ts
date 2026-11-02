import type { MessageThread } from '@3b/contracts';
import { cookies } from 'next/headers';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787';

async function cookieHeader(): Promise<string> {
  return (await cookies()).toString();
}

/**
 * Hilo de chat de un pedido (conversación + mensajes). Lo ven el comprador y la
 * tienda; se crea de forma perezosa al abrirlo. null si no hay sesión o falla.
 */
export async function getOrderThread(
  orderId: string,
): Promise<MessageThread | null> {
  const cookie = await cookieHeader();
  if (!cookie) return null;
  try {
    const res = await fetch(`${API}/v1/orders/${orderId}/conversation`, {
      headers: { cookie },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as MessageThread;
  } catch {
    return null;
  }
}
