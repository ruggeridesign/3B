import type { AttributeDefinition, Category } from '@3b/contracts';
import { cookies } from 'next/headers';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787';

async function cookieHeader(): Promise<string> {
  return (await cookies()).toString();
}

/** Taxonomía de categorías (global). [] si no hay sesión o falla. */
export async function getCategories(): Promise<Category[]> {
  const cookie = await cookieHeader();
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

/** Definiciones de atributo propias de una tienda (solo managers). */
export async function getStoreAttributes(
  storeId: string,
): Promise<AttributeDefinition[]> {
  const cookie = await cookieHeader();
  if (!cookie) return [];
  try {
    const res = await fetch(`${API}/v1/stores/${storeId}/attributes`, {
      headers: { cookie },
      cache: 'no-store',
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { attributes: AttributeDefinition[] };
    return data.attributes;
  } catch {
    return [];
  }
}

/** Atributos resueltos por herencia (global + categoría + tienda). */
export async function getResolvedAttributes(
  storeId: string,
  categoryId?: string,
): Promise<AttributeDefinition[]> {
  const cookie = await cookieHeader();
  if (!cookie) return [];
  const qs = categoryId ? `?categoryId=${categoryId}` : '';
  try {
    const res = await fetch(
      `${API}/v1/stores/${storeId}/attributes/resolved${qs}`,
      { headers: { cookie }, cache: 'no-store' },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as { attributes: AttributeDefinition[] };
    return data.attributes;
  } catch {
    return [];
  }
}
