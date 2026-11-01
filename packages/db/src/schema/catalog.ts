import {
  boolean,
  index,
  jsonb,
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

// Esquema `catalog`: productos/servicios de las tiendas (items) + taxonomía.
export const catalog = pgSchema('catalog');

/**
 * Taxonomía **global** de categorías (jerárquica vía `parent_id`). Reservada al
 * admin de plataforma; los ítems se asignan a una. `kind` acota si aplica a
 * productos, servicios o ambos. (`path` ltree se difirió: los ancestros se
 * resuelven con CTE recursiva sobre `parent_id`.)
 */
export const categories = catalog.table(
  'categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    parentId: uuid('parent_id'),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    kind: text('kind').notNull().default('both'), // product | service | both
    ...timestamps,
  },
  (t) => [
    unique('categories_slug_unique').on(t.slug),
    index('categories_parent_idx').on(t.parentId),
  ],
);

/**
 * Variante de un ítem (combinación de ejes como color/talle). `axis_values`
 * guarda el mapa eje→valor (los ejes son atributos con `variant_axis`).
 * `price_amount` opcional sobreescribe el precio del ítem; `track_stock` lo
 * consume inventario (M3). SKU único por ítem.
 */
export const itemVariants = catalog.table(
  'item_variants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    sku: text('sku').notNull(),
    barcode: text('barcode'),
    axisValues: jsonb('axis_values').notNull().default({}),
    priceAmount: numeric('price_amount', { precision: 12, scale: 2 }),
    trackStock: boolean('track_stock').notNull().default(false),
    ...timestamps,
  },
  (t) => [
    unique('item_variants_item_sku_unique').on(t.itemId, t.sku),
    index('item_variants_barcode_idx').on(t.barcode),
  ],
);

/**
 * Definición de un atributo con **alcance** (D-02): `global` (plataforma),
 * `category` (scope_id = categoría) o `store` (scope_id = tienda). `scope_id` es
 * polimórfico (sin FK dura). Los valores de atributo de cada ítem llegan en una
 * rebanada posterior; acá solo viven las definiciones y su herencia.
 */
export const attributeDefinitions = catalog.table(
  'attribute_definitions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    scope: text('scope').notNull(), // global | category | store
    scopeId: uuid('scope_id'), // null para global; categoría o tienda si no
    key: text('key').notNull(),
    label: text('label').notNull(),
    dataType: text('data_type').notNull(), // text | number | boolean | enum
    options: jsonb('options'), // valores permitidos si data_type=enum
    unit: text('unit'),
    filterable: boolean('filterable').notNull().default(false),
    variantAxis: boolean('variant_axis').notNull().default(false),
    ...timestamps,
  },
  (t) => [
    index('attr_defs_scope_idx').on(t.scope, t.scopeId),
    // Una misma clave no se repite dentro del mismo alcance.
    unique('attr_defs_scope_key_unique').on(t.scope, t.scopeId, t.key),
  ],
);

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
    // Categoría de la taxonomía global (opcional).
    categoryId: uuid('category_id').references(() => categories.id, {
      onDelete: 'set null',
    }),
    kind: text('kind').notNull(), // product | service
    slug: text('slug').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    priceAmount: numeric('price_amount', { precision: 12, scale: 2 }),
    currency: text('currency').notNull().default('USD'),
    priceMode: text('price_mode').notNull().default('fixed'), // fixed | from | quote
    status: text('status').notNull().default('draft'), // draft | published | archived
    // Valores de atributo del ítem, validados contra las definiciones resueltas.
    attributes: jsonb('attributes').notNull().default({}),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    unique('items_store_slug_unique').on(t.storeId, t.slug),
    index('items_community_status_idx').on(t.communityId, t.status),
    index('items_store_idx').on(t.storeId),
  ],
);
