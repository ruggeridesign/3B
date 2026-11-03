import type { Subscription } from '@3b/contracts';
import { cookies } from 'next/headers';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787';

async function cookieHeader(): Promise<string> {
  return (await cookies()).toString();
}

/** Etiqueta legible del estado de una suscripción. */
export const SUBSCRIPTION_STATUS_LABEL: Record<Subscription['status'], string> =
  {
    trial: 'Prueba',
    active: 'Activa',
    past_due: 'Vencida',
    cancelled: 'Cancelada',
  };

/** Suscripción de una tienda. null si no es visible o falla. */
export async function getSubscription(
  storeId: string,
): Promise<Subscription | null> {
  const cookie = await cookieHeader();
  if (!cookie) return null;
  try {
    const res = await fetch(`${API}/v1/stores/${storeId}/subscription`, {
      headers: { cookie },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as Subscription;
  } catch {
    return null;
  }
}
