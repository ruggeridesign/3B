import type { MeResponse } from '@3b/contracts';
import { cookies } from 'next/headers';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787';

/**
 * Obtiene el usuario autenticado + capacidades desde la API, reenviando la
 * cookie de sesión. Se usa en Server Components. Devuelve null si no hay sesión.
 */
export async function getMe(): Promise<MeResponse | null> {
  const cookieHeader = (await cookies()).toString();
  if (!cookieHeader) return null;
  try {
    const res = await fetch(`${API}/v1/me`, {
      headers: { cookie: cookieHeader },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as MeResponse;
  } catch {
    return null;
  }
}
