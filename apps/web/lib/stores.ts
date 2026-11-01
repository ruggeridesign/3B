import type {
  Item,
  KycSubmission,
  PaymentMethod,
  Store,
  StoreHour,
  StoreMember,
} from '@3b/contracts';
import { cookies } from 'next/headers';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787';

/** Reenvía la cookie de sesión del request actual a la API. */
async function cookieHeader(): Promise<string> {
  return (await cookies()).toString();
}

/**
 * Tiendas del usuario autenticado (Server Component), reenviando la cookie de
 * sesión. Devuelve [] si no hay sesión o falla.
 */
export async function getMyStores(): Promise<Store[]> {
  const cookie = await cookieHeader();
  if (!cookie) return [];
  try {
    const res = await fetch(`${API}/v1/stores/mine`, {
      headers: { cookie },
      cache: 'no-store',
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { stores: Store[] };
    return data.stores;
  } catch {
    return [];
  }
}

/** Una tienda por id (si la RLS la deja ver). null si no existe o falla. */
export async function getStore(id: string): Promise<Store | null> {
  const cookie = await cookieHeader();
  if (!cookie) return null;
  try {
    const res = await fetch(`${API}/v1/stores/${id}`, {
      headers: { cookie },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as Store;
  } catch {
    return null;
  }
}

/** Equipo de una tienda. [] si no sos miembro o falla. */
export async function getStoreMembers(id: string): Promise<StoreMember[]> {
  const cookie = await cookieHeader();
  if (!cookie) return [];
  try {
    const res = await fetch(`${API}/v1/stores/${id}/members`, {
      headers: { cookie },
      cache: 'no-store',
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { members: StoreMember[] };
    return data.members;
  } catch {
    return [];
  }
}

/** Métodos de pago de una tienda. [] si no sos miembro o falla. */
export async function getPaymentMethods(id: string): Promise<PaymentMethod[]> {
  const cookie = await cookieHeader();
  if (!cookie) return [];
  try {
    const res = await fetch(`${API}/v1/stores/${id}/payment-methods`, {
      headers: { cookie },
      cache: 'no-store',
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { paymentMethods: PaymentMethod[] };
    return data.paymentMethods;
  } catch {
    return [];
  }
}

/** Horario (intervalos) de una tienda. [] si no hay acceso o falla. */
export async function getStoreHours(id: string): Promise<StoreHour[]> {
  const cookie = await cookieHeader();
  if (!cookie) return [];
  try {
    const res = await fetch(`${API}/v1/stores/${id}/hours`, {
      headers: { cookie },
      cache: 'no-store',
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { hours: StoreHour[] };
    return data.hours;
  } catch {
    return [];
  }
}

/** Verificaciones (KYC) de una tienda. [] si no sos manager o falla. */
export async function getStoreKyc(id: string): Promise<KycSubmission[]> {
  const cookie = await cookieHeader();
  if (!cookie) return [];
  try {
    const res = await fetch(`${API}/v1/stores/${id}/kyc`, {
      headers: { cookie },
      cache: 'no-store',
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { submissions: KycSubmission[] };
    return data.submissions;
  } catch {
    return [];
  }
}

/** Ítems (catálogo) de una tienda. [] si no hay acceso o falla. */
export async function getStoreItems(id: string): Promise<Item[]> {
  const cookie = await cookieHeader();
  if (!cookie) return [];
  try {
    const res = await fetch(`${API}/v1/stores/${id}/items`, {
      headers: { cookie },
      cache: 'no-store',
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { items: Item[] };
    return data.items;
  } catch {
    return [];
  }
}
