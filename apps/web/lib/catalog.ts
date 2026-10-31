import type { Category } from '@3b/contracts';
import { cookies } from 'next/headers';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787';

/** Taxonomía de categorías (global). [] si no hay sesión o falla. */
export async function getCategories(): Promise<Category[]> {
  const cookie = (await cookies()).toString();
  if (!cookie) return [];
  try {
    const res = await fetch(`${API}/v1/categories`, {
      headers: { cookie },
      cache: 'no-store',
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { categories: Category[] };
    return data.categories;
  } catch {
    return [];
  }
}
