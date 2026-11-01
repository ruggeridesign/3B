import type {
  AttributeDefinition,
  Category,
  Collection,
  DiscoveryItem,
  ItemVariant,
  Media,
  PublicItem,
  PublicStore,
  ServiceDetail,
  StockLevel,
} from '@3b/contracts';
import { cookies } from 'next/headers';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787';

async function cookieHeader(): Promise<string> {
  return (await cookies()).toString();
}

/** Feed/búsqueda de ítems publicados (descubrimiento). Vacío si no hay sesión. */
export async function getDiscoveryItems(params: {
  q?: string;
  kind?: string;
  categoryId?: string;
  limit?: number;
  offset?: number;
}): Promise<{ items: DiscoveryItem[]; hasMore: boolean }> {
  const cookie = await cookieHeader();
  if (!cookie) return { items: [], hasMore: false };
  const qs = new URLSearchParams();
  if (params.q) qs.set('q', params.q);
  if (params.kind) qs.set('kind', params.kind);
  if (params.categoryId) qs.set('categoryId', params.categoryId);
  if (params.limit != null) qs.set('limit', String(params.limit));
  if (params.offset != null) qs.set('offset', String(params.offset));
  try {
    const res = await fetch(`${API}/v1/discovery/items?${qs.toString()}`, {
      headers: { cookie },
      cache: 'no-store',
    });
    if (!res.ok) return { items: [], hasMore: false };
    return (await res.json()) as { items: DiscoveryItem[]; hasMore: boolean };
  } catch {
    return { items: [], hasMore: false };
  }
}

/** Ficha pública de un ítem (descubrimiento). null si no es visible o falla. */
export async function getPublicItem(id: string): Promise<PublicItem | null> {
  const cookie = await cookieHeader();
  if (!cookie) return null;
  try {
    const res = await fetch(`${API}/v1/discovery/items/${id}`, {
      headers: { cookie },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as PublicItem;
  } catch {
    return null;
  }
}

/** Ficha pública de una tienda (storefront). null si no es visible o falla. */
export async function getPublicStore(id: string): Promise<PublicStore | null> {
  const cookie = await cookieHeader();
  if (!cookie) return null;
  try {
    const res = await fetch(`${API}/v1/discovery/stores/${id}`, {
      headers: { cookie },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as PublicStore;
  } catch {
    return null;
  }
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

/** Imágenes/archivos de un ítem (media con owner_type=item). */
export async function getItemMedia(itemId: string): Promise<Media[]> {
  const cookie = await cookieHeader();
  if (!cookie) return [];
  try {
    const res = await fetch(
      `${API}/v1/media?ownerType=item&ownerId=${itemId}`,
      { headers: { cookie }, cache: 'no-store' },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as { media: Media[] };
    return data.media;
  } catch {
    return [];
  }
}

/** Variantes de un ítem. */
export async function getItemVariants(
  storeId: string,
  itemId: string,
): Promise<ItemVariant[]> {
  const cookie = await cookieHeader();
  if (!cookie) return [];
  try {
    const res = await fetch(
      `${API}/v1/stores/${storeId}/items/${itemId}/variants`,
      { headers: { cookie }, cache: 'no-store' },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as { variants: ItemVariant[] };
    return data.variants;
  } catch {
    return [];
  }
}

/** Colecciones (vitrina) de una tienda, con sus ítems. [] si falla. */
export async function getStoreCollections(
  storeId: string,
): Promise<Collection[]> {
  const cookie = await cookieHeader();
  if (!cookie) return [];
  try {
    const res = await fetch(`${API}/v1/stores/${storeId}/collections`, {
      headers: { cookie },
      cache: 'no-store',
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { collections: Collection[] };
    return data.collections;
  } catch {
    return [];
  }
}

/** Detalle de servicio de un ítem (null si no tiene o si falla). */
export async function getItemServiceDetail(
  storeId: string,
  itemId: string,
): Promise<ServiceDetail | null> {
  const cookie = await cookieHeader();
  if (!cookie) return null;
  try {
    const res = await fetch(
      `${API}/v1/stores/${storeId}/items/${itemId}/service`,
      { headers: { cookie }, cache: 'no-store' },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { serviceDetail: ServiceDetail | null };
    return data.serviceDetail;
  } catch {
    return null;
  }
}

/** Existencias (por variante) de un ítem. [] si no sos miembro o falla. */
export async function getItemStock(
  storeId: string,
  itemId: string,
): Promise<StockLevel[]> {
  const cookie = await cookieHeader();
  if (!cookie) return [];
  try {
    const res = await fetch(
      `${API}/v1/stores/${storeId}/items/${itemId}/stock`,
      { headers: { cookie }, cache: 'no-store' },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as { levels: StockLevel[] };
    return data.levels;
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
