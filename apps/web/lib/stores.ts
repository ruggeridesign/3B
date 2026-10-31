import type { Store } from '@3b/contracts';
import { cookies } from 'next/headers';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787';

/**
 * Tiendas del usuario autenticado (Server Component), reenviando la cookie de
 * sesión. Devuelve [] si no hay sesión o falla.
 */
export async function getMyStores(): Promise<Store[]> {
  const cookieHeader = (await cookies()).toString();
  if (!cookieHeader) return [];
  try {
    const res = await fetch(`${API}/v1/stores/mine`, {
      headers: { cookie: cookieHeader },
      cache: 'no-store',
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { stores: Store[] };
    return data.stores;
  } catch {
    return [];
  }
}
