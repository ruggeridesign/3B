import {
  bigint,
  index,
  integer,
  jsonb,
  numeric,
  pgSchema,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { timestamps } from './_shared';
import { items, itemVariants } from './catalog';
import { communities } from './community';
import { users } from './identity';
import { stores } from './store';

// Esquema `orders`: pedidos (un pedido por tienda), sus líneas congeladas y la
// bitácora de transiciones. M5a solo crea pedidos en estado `realizado`.
export const orders = pgSchema('orders');

/**
 * Un pedido de un Maker a una tienda. `community_id` se toma de la tienda al
 * crearlo (D-05). `number` es un correlativo legible (identity). Montos en
 * `numeric` + moneda explícita; `fx_rate_ves` se congela en M5c (P-2) — nulo por
 * ahora. `idempotency_key` (único por Maker) hace el checkout reintentable (O-4).
 * La RLS: lo ve el Maker dueño o un miembro de la tienda; lo crea solo el Maker.
 */
export const orderRecords = orders.table(
  'orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    number: bigint('number', { mode: 'number' })
      .notNull()
      .generatedByDefaultAsIdentity({ startWith: 1000 }),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'restrict' }),
    // Denormalizado desde la tienda al crear el pedido (una tienda vive en una
    // comunidad; D-05).
    communityId: uuid('community_id')
      .notNull()
      .references(() => communities.id, { onDelete: 'restrict' }),
    makerId: uuid('maker_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    status: text('status').notNull().default('realizado'),
    fulfillment: text('fulfillment').notNull(), // pickup | delivery | service
    subtotal: numeric('subtotal', { precision: 12, scale: 2 }).notNull(),
    shippingAmount: numeric('shipping_amount', { precision: 12, scale: 2 })
      .notNull()
      .default('0'),
    feeAmount: numeric('fee_amount', { precision: 12, scale: 2 })
      .notNull()
      .default('0'),
    total: numeric('total', { precision: 12, scale: 2 }).notNull(),
    currency: text('currency').notNull().default('USD'),
    // Tasa Bs congelada al crear (la llena M5c; nula en M5a).
    fxRateVes: numeric('fx_rate_ves', { precision: 14, scale: 4 }),
    addressSnapshot: jsonb('address_snapshot'),
    note: text('note'),
    idempotencyKey: text('idempotency_key'),
    ...timestamps,
  },
  (t) => [
    unique('orders_number_unique').on(t.number),
    // Idempotencia del checkout: una clave no crea dos pedidos para el mismo Maker.
    unique('orders_maker_idem_unique').on(t.makerId, t.idempotencyKey),
    index('orders_store_status_idx').on(t.storeId, t.status),
    index('orders_maker_idx').on(t.makerId),
  ],
);

/**
 * Línea del pedido con título/SKU/precio **congelados** (O-1). `variant_id`/
 * `item_id` quedan como referencia blanda (ON DELETE SET NULL): si el catálogo
 * cambia, la línea conserva lo que se compró. La RLS se deriva del pedido padre.
 */
export const orderItems = orders.table(
  'order_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orderRecords.id, { onDelete: 'cascade' }),
    variantId: uuid('variant_id').references(() => itemVariants.id, {
      onDelete: 'set null',
    }),
    itemId: uuid('item_id').references(() => items.id, {
      onDelete: 'set null',
    }),
    title: text('title').notNull(),
    sku: text('sku'),
    unitPrice: numeric('unit_price', { precision: 12, scale: 2 }).notNull(),
    currency: text('currency').notNull().default('USD'),
    qty: integer('qty').notNull(),
    lineTotal: numeric('line_total', { precision: 12, scale: 2 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('order_items_order_idx').on(t.orderId)],
);

/**
 * Bitácora de transiciones del pedido (solo inserción, O-2). Cada cambio de
 * estado deja una fila con actor y motivo; al crear se registra `→ realizado`.
 * La RLS se deriva del pedido padre.
 */
export const orderEvents = orders.table(
  'order_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orderRecords.id, { onDelete: 'cascade' }),
    fromStatus: text('from_status'),
    toStatus: text('to_status').notNull(),
    actorId: uuid('actor_id'),
    reason: text('reason'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('order_events_order_idx').on(t.orderId, t.createdAt)],
);
