import {
  index,
  integer,
  pgSchema,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { timestamps } from './_shared';
import { itemVariants } from './catalog';

// Esquema `inventory`: existencias y libro de movimientos por variante.
export const inventory = pgSchema('inventory');

/**
 * Existencias de una variante (proyección; `variant_id` es la PK → 1:0..1). La
 * mantiene un trigger a partir de los movimientos; `available = on_hand -
 * reserved` se calcula al leer. El rol `app` solo tiene SELECT: la proyección es
 * de solo lectura para la app (la escribe el trigger). `version` para OCC futura.
 */
export const stockLevels = inventory.table('stock_levels', {
  variantId: uuid('variant_id')
    .primaryKey()
    .references(() => itemVariants.id, { onDelete: 'cascade' }),
  onHand: integer('on_hand').notNull().default(0),
  reserved: integer('reserved').notNull().default(0),
  lowThreshold: integer('low_threshold'),
  version: integer('version').notNull().default(0),
  ...timestamps,
});

/**
 * Libro de movimientos de stock (solo inserción). `qty` es el delta con signo
 * sobre `on_hand`. `idempotency_key` (único) hace reintentable el alta. El rol
 * `app` solo tiene SELECT/INSERT: nunca se edita ni se borra un asiento.
 */
export const stockMovements = inventory.table(
  'stock_movements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    variantId: uuid('variant_id')
      .notNull()
      .references(() => itemVariants.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(), // receipt | sale | adjustment | return
    channel: text('channel').notNull().default('counter'), // online | counter | system
    qty: integer('qty').notNull(),
    reference: text('reference'),
    idempotencyKey: text('idempotency_key'),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('stock_movements_variant_idx').on(t.variantId, t.createdAt)],
);
