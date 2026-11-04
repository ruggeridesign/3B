import type { KycSubmission } from '@3b/contracts';
import { cookies } from 'next/headers';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787';

async function cookieHeader(): Promise<string> {
  return (await cookies()).toString();
}

/**
 * Cola de verificaciones (KYC) `pending` de las tiendas de una comunidad, para el
 * admin de esa comunidad (M7d). La RLS es el candado: solo el admin de la comunidad
 * (o de plataforma) ve estas filas. [] si no tenés acceso o falla.
 */
export async function getCommunityKyc(
  communityId: string,
): Promise<KycSubmission[]> {
  const cookie = await cookieHeader();
  if (!cookie) return [];
  try {
    const res = await fetch(`${API}/v1/communities/${communityId}/kyc`, {
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
