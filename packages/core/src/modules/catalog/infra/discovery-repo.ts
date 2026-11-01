import type {
  DiscoveryFacets,
  DiscoveryItem,
  DiscoveryQuery,
  PublicItem,
  PublicItemVariant,
  PublicStore,
} from '@3b/contracts';
import { type AppTransaction, sql } from '@3b/db';

type Row = {
  id: string;
  store_id: string;
  store_name: string;
  store_slug: string;
  community_id: string;
  community_name: string | null;
  category_id: string | null;
  kind: string;
  slug: string;
  title: string;
  description: string | null;
  price_amount: string | null;
  currency: string;
  price_mode: string;
  published_at: string | Date | null;
  created_at: string | Date;
};

function toDiscoveryItem(r: Row): DiscoveryItem {
  return {
    id: r.id,
    storeId: r.store_id,
    storeName: r.store_name,
    storeSlug: r.store_slug,
    communityId: r.community_id,
    communityName: r.community_name,
    categoryId: r.category_id,
    kind: r.kind as DiscoveryItem['kind'],
    slug: r.slug,
    title: r.title,
    description: r.description,
    priceAmount: r.price_amount,
    currency: r.currency,
    priceMode: r.price_mode as DiscoveryItem['priceMode'],
    publishedAt: r.published_at ? new Date(r.published_at).toISOString() : null,
    createdAt: new Date(r.created_at).toISOString(),
  };
}

/**
 * Busca ítems para el feed/búsqueda. Solo **publicados**; la RLS de `items` acota
 * además a comunidad visible (pública o del usuario). Con `q`, combina full-text
 * (`search_tsv`) con ILIKE sin acentos (pg_trgm, tolera tipeos) y ordena por
 * relevancia; sin `q`, feed por recencia. Trae `limit + 1` para saber si hay más.
 */
export async function searchItems(
  db: AppTransaction,
  params: DiscoveryQuery,
): Promise<{ items: DiscoveryItem[]; hasMore: boolean }> {
  const { q, communityId, storeId, categoryId, kind, attrs, limit, offset } =
    params;

  const conds = [sql`i.status = 'published'`];
  if (communityId) conds.push(sql`i.community_id = ${communityId}`);
  if (storeId) conds.push(sql`i.store_id = ${storeId}`);
  if (categoryId) conds.push(sql`i.category_id = ${categoryId}`);
  if (kind) conds.push(sql`i.kind = ${kind}`);
  // Filtros por atributo (AND): el ítem debe tener cada (key, value).
  for (const a of attrs ?? []) {
    conds.push(sql`EXISTS (
      SELECT 1 FROM catalog.item_attr_index a
      WHERE a.item_id = i.id AND a.key = ${a.key} AND a.value_text = ${a.value}
    )`);
  }

  const trimmed = q?.trim();
  const tsq = trimmed
    ? sql`websearch_to_tsquery('spanish', catalog.f_unaccent(${trimmed}))`
    : null;
  if (trimmed && tsq) {
    conds.push(
      sql`(i.search_tsv @@ ${tsq} OR catalog.f_unaccent(i.title) ILIKE '%' || catalog.f_unaccent(${trimmed}) || '%')`,
    );
  }

  const where = sql.join(conds, sql` AND `);
  const orderBy =
    trimmed && tsq
      ? sql`ts_rank(i.search_tsv, ${tsq}) DESC, i.published_at DESC NULLS LAST, i.created_at DESC`
      : sql`i.published_at DESC NULLS LAST, i.created_at DESC`;

  const rows = (await db.execute(sql`
    SELECT i.id, i.store_id, s.name AS store_name, s.slug AS store_slug,
           i.community_id, c.name AS community_name, i.category_id, i.kind,
           i.slug, i.title, i.description, i.price_amount, i.currency,
           i.price_mode, i.published_at, i.created_at
    FROM catalog.items i
    JOIN store.stores s ON s.id = i.store_id
    LEFT JOIN community.communities c ON c.id = i.community_id
    WHERE ${where}
    ORDER BY ${orderBy}
    LIMIT ${limit + 1} OFFSET ${offset}
  `)) as unknown as Row[];

  const hasMore = rows.length > limit;
  return { items: rows.slice(0, limit).map(toDiscoveryItem), hasMore };
}

/**
 * Ficha pública de un ítem (o null si no es visible para el usuario). Reúne el
 * ítem + tienda + comunidad + variantes (con disponibilidad) + detalle de servicio
 * + imágenes. La RLS acota todo; `publicUrl` arma la URL de cada media (inyectado
 * para no acoplar catalog→media/storage).
 */
export async function getPublicItem(
  db: AppTransaction,
  id: string,
  publicUrl: (key: string) => string,
): Promise<PublicItem | null> {
  const headRows = (await db.execute(sql`
    SELECT i.id, i.store_id, s.name AS store_name, s.slug AS store_slug,
           (s.verification_level = 'verified') AS store_verified,
           i.community_id, c.name AS community_name, i.category_id, i.kind,
           i.slug, i.title, i.description, i.price_amount, i.currency,
           i.price_mode, i.attributes, i.published_at, i.created_at
    FROM catalog.items i
    JOIN store.stores s ON s.id = i.store_id
    LEFT JOIN community.communities c ON c.id = i.community_id
    WHERE i.id = ${id}
    LIMIT 1
  `)) as unknown as Array<
    Row & {
      store_verified: boolean;
      attributes: PublicItem['attributes'] | null;
    }
  >;
  const head = headRows[0];
  if (!head) return null;

  const variantRows = (await db.execute(sql`
    SELECT v.id, v.sku, v.axis_values, v.price_amount,
           (l.on_hand - l.reserved) AS available
    FROM catalog.item_variants v
    LEFT JOIN inventory.stock_levels l ON l.variant_id = v.id
    WHERE v.item_id = ${id}
    ORDER BY v.sku
  `)) as unknown as Array<{
    id: string;
    sku: string;
    axis_values: PublicItem['attributes'] | null;
    price_amount: string | null;
    available: number | null;
  }>;

  const svcRows = (await db.execute(sql`
    SELECT duration_min, modality, coverage_km, notes
    FROM catalog.service_details WHERE item_id = ${id} LIMIT 1
  `)) as unknown as Array<{
    duration_min: number | null;
    modality: string;
    coverage_km: number | null;
    notes: string | null;
  }>;

  const mediaRows = (await db.execute(sql`
    SELECT key FROM media.media
    WHERE owner_type = 'item' AND owner_id = ${id} AND status = 'ready'
    ORDER BY created_at
  `)) as unknown as Array<{ key: string }>;

  const svc = svcRows[0];
  return {
    id: head.id,
    storeId: head.store_id,
    storeName: head.store_name,
    storeSlug: head.store_slug,
    storeVerified: head.store_verified,
    communityId: head.community_id,
    communityName: head.community_name,
    categoryId: head.category_id,
    kind: head.kind as PublicItem['kind'],
    slug: head.slug,
    title: head.title,
    description: head.description,
    priceAmount: head.price_amount,
    currency: head.currency,
    priceMode: head.price_mode as PublicItem['priceMode'],
    attributes: head.attributes ?? {},
    images: mediaRows.map((m) => publicUrl(m.key)),
    variants: variantRows.map((v) => ({
      id: v.id,
      sku: v.sku,
      axisValues: (v.axis_values as PublicItemVariant['axisValues']) ?? {},
      priceAmount: v.price_amount,
      available: v.available,
    })),
    serviceDetail: svc
      ? {
          durationMin: svc.duration_min,
          modality: svc.modality as NonNullable<
            PublicItem['serviceDetail']
          >['modality'],
          coverageKm: svc.coverage_km,
          notes: svc.notes,
        }
      : null,
    publishedAt: head.published_at
      ? new Date(head.published_at).toISOString()
      : null,
    createdAt: new Date(head.created_at).toISOString(),
  };
}

/**
 * Ficha pública de una tienda (o null si no es visible). Cabecera + horario +
 * ítems publicados (reusa `searchItems` filtrando por tienda). La RLS acota todo.
 */
export async function getPublicStore(
  db: AppTransaction,
  id: string,
): Promise<PublicStore | null> {
  const headRows = (await db.execute(sql`
    SELECT s.id, s.name, s.slug, s.kind,
           (s.verification_level = 'verified') AS verified,
           s.community_id, c.name AS community_name
    FROM store.stores s
    LEFT JOIN community.communities c ON c.id = s.community_id
    WHERE s.id = ${id}
    LIMIT 1
  `)) as unknown as Array<{
    id: string;
    name: string;
    slug: string;
    kind: string;
    verified: boolean;
    community_id: string;
    community_name: string | null;
  }>;
  const head = headRows[0];
  if (!head) return null;

  const { items } = await searchItems(db, {
    storeId: id,
    limit: 50,
    offset: 0,
  });

  const hourRows = (await db.execute(sql`
    SELECT id, weekday, opens_min, closes_min, created_at
    FROM store.store_hours
    WHERE store_id = ${id}
    ORDER BY weekday, opens_min
  `)) as unknown as Array<{
    id: string;
    weekday: number;
    opens_min: number;
    closes_min: number;
    created_at: string | Date;
  }>;

  return {
    id: head.id,
    name: head.name,
    slug: head.slug,
    kind: head.kind as PublicStore['kind'],
    verified: head.verified,
    communityId: head.community_id,
    communityName: head.community_name,
    hours: hourRows.map((h) => ({
      id: h.id,
      storeId: id,
      weekday: h.weekday,
      opensMin: h.opens_min,
      closesMin: h.closes_min,
      createdAt: new Date(h.created_at).toISOString(),
    })),
    items,
  };
}

/**
 * Facetas (filtros dinámicos) para un contexto de búsqueda: valores de atributo
 * disponibles entre los ítems publicados que matchean el filtro base (comunidad/
 * tienda/categoría/tipo/`q`), con su conteo. No aplica los filtros de atributo
 * (así se ven todas las opciones). La RLS acota (join a items + index).
 */
export async function getFacets(
  db: AppTransaction,
  params: Omit<DiscoveryQuery, 'attrs' | 'limit' | 'offset'>,
): Promise<DiscoveryFacets> {
  const { q, communityId, storeId, categoryId, kind } = params;
  const conds = [sql`i.status = 'published'`, sql`a.value_text IS NOT NULL`];
  if (communityId) conds.push(sql`i.community_id = ${communityId}`);
  if (storeId) conds.push(sql`i.store_id = ${storeId}`);
  if (categoryId) conds.push(sql`i.category_id = ${categoryId}`);
  if (kind) conds.push(sql`i.kind = ${kind}`);
  const trimmed = q?.trim();
  if (trimmed) {
    conds.push(
      sql`(i.search_tsv @@ websearch_to_tsquery('spanish', catalog.f_unaccent(${trimmed})) OR catalog.f_unaccent(i.title) ILIKE '%' || catalog.f_unaccent(${trimmed}) || '%')`,
    );
  }
  const where = sql.join(conds, sql` AND `);

  const rows = (await db.execute(sql`
    SELECT a.key, a.value_text AS value, count(*)::int AS count
    FROM catalog.item_attr_index a
    JOIN catalog.items i ON i.id = a.item_id
    WHERE ${where}
    GROUP BY a.key, a.value_text
    ORDER BY a.key, count DESC, a.value_text
  `)) as unknown as Array<{ key: string; value: string; count: number }>;

  const byKey = new Map<string, { value: string; count: number }[]>();
  for (const r of rows) {
    const list = byKey.get(r.key) ?? [];
    list.push({ value: r.value, count: r.count });
    byKey.set(r.key, list);
  }
  return {
    facets: [...byKey.entries()].map(([key, values]) => ({ key, values })),
  };
}
