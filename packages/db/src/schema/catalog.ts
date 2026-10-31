import {
  index,
  numeric,
  pgSchema,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { timestamps } from './_shared';
import { communities } from './community';
import { stores } from './store';

// Esquema `catalog`: productos/servicios de las tiendas. Primera rebanada: items.
export const catalog = pgSchema('catalog');

/**
 * Un ítem (producto o servicio) de una tienda. `community_id` se **denormaliza**
 * desde la tienda vía trigger (D-05) para RLS/rendimiento. Precio en `numeric` +
 * moneda explícita. Categoría, atributos, variantes y `search_tsv` llegan en
 * rebanadas siguientes.
 */
export const items = catalog.table(
  'items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    // Denormalizado desde la tienda (lo fija un trigger SECURITY DEFINER).
    communityId: uuid('community_id')
      .notNull()
      .references(() => communities.id, { onDelete: 'restrict' }),
    kind: text('kind').notNull(), // product | service
    slug: text('slug').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    priceAmount: numeric('price_amount', { precision: 12, scale: 2 }),
    currency: text('currency').notNull().default('USD'),
    priceMode: text('price_mode').notNull().default('fixed'), // fixed | from | quote
    status: text('status').notNull().default('draft'), // draft | published | archived
    publishedAt: timestamp('published_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    unique('items_store_slug_unique').on(t.storeId, t.slug),
    index('items_community_status_idx').on(t.communityId, t.status),
    index('items_store_idx').on(t.storeId),
  ],
);
