import {
  numeric,
  pgSchema,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { timestamps } from './_shared';
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
