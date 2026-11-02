import {
  date,
  index,
  numeric,
  pgSchema,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { timestamps } from './_shared';
import { users } from './identity';
import { mediaFiles } from './media';
import { orderRecords } from './orders';

// Esquema `payments`: reportes de pago (comprobantes) por pedido + tasa de
// cambio congelable (BCV). M5c — pago por comprobante.
export const payments = pgSchema('payments');

/**
 * Reporte de pago (comprobante) de un pedido. El Maker lo crea (`reported`); el
 * Seller lo confirma/rechaza (`confirmed`/`rejected`), lo que mueve el pedido por
 * la máquina de estados. `reference` es la referencia bancaria **única global**
 * (P-1): bloquea reportar dos veces la misma. `proof_media_id` (captura) queda
 * previsto; su subida/visibilidad llega después. La RLS: lo ve el Maker del
 * pedido o un miembro de la tienda; lo crea el Maker, lo revisa la tienda.
 */
export const paymentReports = payments.table(
  'payment_reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orderRecords.id, { onDelete: 'cascade' }),
    method: text('method').notNull(), // PaymentMethodType (store)
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    currency: text('currency').notNull().default('USD'),
    reference: text('reference').notNull(),
    status: text('status').notNull().default('reported'), // reported | confirmed | rejected
    note: text('note'),
    proofMediaId: uuid('proof_media_id').references(() => mediaFiles.id, {
      onDelete: 'set null',
    }),
    reportedBy: uuid('reported_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    reviewedBy: uuid('reviewed_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    // P-1: una referencia (por método) no se reporta dos veces.
    unique('payment_reports_method_reference_unique').on(t.method, t.reference),
    index('payment_reports_order_idx').on(t.orderId),
    // Lookup inverso media→reporte (policy de visibilidad de la captura, M5c.2).
    index('payment_reports_proof_idx').on(t.proofMediaId),
  ],
);

/**
 * Tasa de cambio del día (BCV): USD→VES. `date` es la PK. Tabla de referencia de
 * solo lectura para la app (la cargan seed/proceso externo). El pedido congela
 * su `fx_rate_ves` tomando la tasa vigente al reportar el pago (P-2).
 */
export const fxRates = payments.table('fx_rates', {
  date: date('date').primaryKey(),
  source: text('source').notNull().default('BCV'),
  usdVes: numeric('usd_ves', { precision: 14, scale: 4 }).notNull(),
  ...timestamps,
});
