import type { FeeAccrualList, Subscription } from '@3b/contracts';
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

/** Comisiones devengadas de una tienda (equipo o admin). null si falla. */
export async function getStoreFeeAccruals(
  storeId: string,
): Promise<FeeAccrualList | null> {
  const cookie = await cookieHeader();
  if (!cookie) return null;
  try {
    const res = await fetch(`${API}/v1/stores/${storeId}/fee-accruals`, {
      headers: { cookie },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as FeeAccrualList;
  } catch {
    return null;
  }
}

/** Mis comisiones devengadas como Mover. null si falla. */
export async function getMyFeeAccruals(): Promise<FeeAccrualList | null> {
  const cookie = await cookieHeader();
  if (!cookie) return null;
  try {
    const res = await fetch(`${API}/v1/me/fee-accruals`, {
      headers: { cookie },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as FeeAccrualList;
  } catch {
    return null;
  }
}

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
