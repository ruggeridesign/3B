import type { Review, StoreReviewSummary } from '@3b/contracts';
import { cookies } from 'next/headers';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787';

async function cookieHeader(): Promise<string> {
  return (await cookies()).toString();
}

/** Reseñas de un pedido (para saber si ya reseñé). [] si no hay sesión o falla. */
export async function getOrderReviews(orderId: string): Promise<Review[]> {
  const cookie = await cookieHeader();
  if (!cookie) return [];
  try {
    const res = await fetch(`${API}/v1/orders/${orderId}/reviews`, {
      headers: { cookie },
      cache: 'no-store',
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { reviews: Review[] };
    return data.reviews;
  } catch {
    return [];
  }
}

/** Resumen de reseñas de una tienda (conteo + promedio + recientes). null si falla. */
export async function getStoreReviews(
  storeId: string,
): Promise<StoreReviewSummary | null> {
  const cookie = await cookieHeader();
  if (!cookie) return null;
  try {
    const res = await fetch(`${API}/v1/stores/${storeId}/reviews`, {
      headers: { cookie },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as StoreReviewSummary;
  } catch {
    return null;
  }
}

/** Estrellas llenas/vacías para un rating 1–5 (presentación). */
export function stars(rating: number): string {
  const n = Math.round(rating);
  return '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n);
}
