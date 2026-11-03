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
import { orderRecords } from './orders';
import { shipments } from './shipping';
import { stores } from './store';

// Esquema `billing`: planes y suscripciones de tienda (M7a). Las comisiones
// (`fee_accruals`) y los estados de cuenta (`statements`) llegan en M7b/M7c.
export const billing = pgSchema('billing');

/**
 * Plan de suscripción (datos de referencia, cargados por seed/owner). `code` es
 * único y mapea con `stores.kind`. Lectura pública para la app.
 */
export const plans = billing.table('plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: text('code').notNull().unique(), // seller_products | seller_services
  name: text('name').notNull(),
  priceAmount: numeric('price_amount', { precision: 12, scale: 2 }).notNull(),
  currency: text('currency').notNull().default('USD'),
  ...timestamps,
});

/**
 * Suscripción de una tienda (**una** por tienda, `unique(store_id)`). Nace `trial`
 * al crear la tienda (trigger definer) con el plan según su `kind`; un admin la
 * activa/cambia. `period_end` marca el fin del período vigente. La RLS: la ve el
 * equipo de la tienda o un admin (comunidad/plataforma); la cambia un admin.
 */
export const subscriptions = billing.table(
  'subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    planId: uuid('plan_id')
      .notNull()
      .references(() => plans.id, { onDelete: 'restrict' }),
    status: text('status').notNull().default('trial'), // trial | active | past_due | cancelled
    periodEnd: timestamp('period_end', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [unique('subscriptions_store_unique').on(t.storeId)],
);

/**
 * Parámetros de billing (clave/valor). Hoy guarda `commission_rate` (fracción
 * 0..1), cargada por el seed desde `COMMISSION_RATE`. La leen los triggers de
 * devengo (owner); la app no accede (owner-only).
 */
export const billingConfig = billing.table('config', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  ...timestamps,
});

/**
 * Comisión **devengada** (solo inserción). Sujeto polimórfico (`store` en ventas,
 * `mover` en envíos) para soportar el billing de ambos. `community_id` se
 * denormaliza (alcance de admins). Una por pedido (`unique(order_id)`) y una por
 * envío (`unique(shipment_id)`); los NULL no colisionan. La escriben triggers
 * definer (al `completado` del pedido y al `entregado` del envío); la app solo lee.
 */
export const feeAccruals = billing.table(
  'fee_accruals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    subjectType: text('subject_type').notNull(), // store | mover
    subjectId: uuid('subject_id').notNull(),
    kind: text('kind').notNull(), // sale | shipment
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    currency: text('currency').notNull().default('USD'),
    communityId: uuid('community_id')
      .notNull()
      .references(() => communities.id, { onDelete: 'restrict' }),
    orderId: uuid('order_id').references(() => orderRecords.id, {
      onDelete: 'set null',
    }),
    shipmentId: uuid('shipment_id').references(() => shipments.id, {
      onDelete: 'set null',
    }),
    accruedAt: timestamp('accrued_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique('fee_accruals_order_unique').on(t.orderId),
    unique('fee_accruals_shipment_unique').on(t.shipmentId),
    index('fee_accruals_subject_idx').on(
      t.subjectType,
      t.subjectId,
      t.accruedAt,
    ),
    index('fee_accruals_community_idx').on(t.communityId),
  ],
);
