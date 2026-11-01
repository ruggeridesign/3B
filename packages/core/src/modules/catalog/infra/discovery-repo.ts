import type {
  DiscoveryItem,
  DiscoveryQuery,
  PublicItem,
  PublicItemVariant,
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
  const { q, communityId, categoryId, kind, limit, offset } = params;

  const conds = [sql`i.status = 'published'`];
  if (communityId) conds.push(sql`i.community_id = ${communityId}`);
  if (categoryId) conds.push(sql`i.category_id = ${categoryId}`);
  if (kind) conds.push(sql`i.kind = ${kind}`);

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
