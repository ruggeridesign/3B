import { z } from 'zod';

/**
 * Contratos del módulo `billing`. **M7a — planes + suscripciones**: cada tienda se
 * suscribe a un plan (`seller_products`/`seller_services`); nace en `trial` al
 * crearla y un admin la activa/cambia. Las comisiones devengadas (`fee_accruals`) y
 * los estados de cuenta (`statements`) llegan en M7b/M7c.
 */

const money = z.string().regex(/^\d{1,10}(\.\d{1,2})?$/);
const currency = z.string().regex(/^[A-Z]{3}$/);

/** Código de plan (fuente única). Mapea 1:1 con `stores.kind`. */
export const PlanCode = z.enum(['seller_products', 'seller_services']);
export type PlanCode = z.infer<typeof PlanCode>;

/** Un plan de suscripción (precio mensual). */
export const Plan = z.object({
  id: z.string(),
  code: PlanCode,
  name: z.string(),
  priceAmount: money,
  currency,
});
export type Plan = z.infer<typeof Plan>;

/** Lista de planes disponibles. */
export const PlanList = z.object({ plans: z.array(Plan) });
export type PlanList = z.infer<typeof PlanList>;

/** Estado de una suscripción. */
export const SubscriptionStatus = z.enum([
  'trial',
  'active',
  'past_due',
  'cancelled',
]);
export type SubscriptionStatus = z.infer<typeof SubscriptionStatus>;

/** Suscripción de una tienda (una por tienda). */
export const Subscription = z.object({
  id: z.string(),
  storeId: z.string(),
  planId: z.string(),
  planCode: PlanCode,
  planName: z.string(),
  priceAmount: money,
  currency,
  status: SubscriptionStatus,
  periodEnd: z.string().nullable(),
  createdAt: z.string(),
});
export type Subscription = z.infer<typeof Subscription>;

/**
 * El admin (de comunidad o plataforma) fija el estado/plan de una suscripción.
 * `periodEnd` extiende el período (p. ej. al cobrar un mes).
 */
export const SetSubscriptionInput = z.object({
  status: SubscriptionStatus,
  planCode: PlanCode.optional(),
  periodEnd: z.string().datetime().optional(),
});
export type SetSubscriptionInput = z.infer<typeof SetSubscriptionInput>;

/** A quién se le devenga una comisión (D-04 del modelo, generalizado para M7). */
export const FeeSubjectType = z.enum(['store', 'mover']);
export type FeeSubjectType = z.infer<typeof FeeSubjectType>;

/** Tipo de comisión: venta (al `completado`) o envío (al `entregado`, S-3). */
export const FeeKind = z.enum(['sale', 'shipment']);
export type FeeKind = z.infer<typeof FeeKind>;

/** Una comisión **devengada** (solo inserción). */
export const FeeAccrual = z.object({
  id: z.string(),
  subjectType: FeeSubjectType,
  subjectId: z.string(),
  kind: FeeKind,
  amount: money,
  currency,
  communityId: z.string(),
  orderId: z.string().nullable(),
  shipmentId: z.string().nullable(),
  accruedAt: z.string(),
});
export type FeeAccrual = z.infer<typeof FeeAccrual>;

/** Comisiones devengadas de un sujeto + su total (en la moneda base). */
export const FeeAccrualList = z.object({
  accruals: z.array(FeeAccrual),
  total: money,
  currency,
});
export type FeeAccrualList = z.infer<typeof FeeAccrualList>;

/**
 * Estado de un estado de cuenta (M7c). `open`: generado, por cobrar; `pending`:
 * con pago reportado (comprobante), a la espera de confirmación del admin (M7c.2);
 * `paid`: cobro confirmado.
 */
export const StatementStatus = z.enum(['open', 'pending', 'paid']);
export type StatementStatus = z.infer<typeof StatementStatus>;

/**
 * Estado de cuenta **mensual** de un sujeto (tienda o Mover). Lo genera un job del
 * worker sumando la cuota de suscripción del período (0 para Movers y tiendas en
 * `trial`) más las comisiones devengadas (`fee_accruals`) del mes. `period` es
 * `YYYY-MM`. `communityId` es null para Movers (billing de Movers = plataforma).
 */
export const Statement = z.object({
  id: z.string(),
  subjectType: FeeSubjectType,
  subjectId: z.string(),
  period: z.string().regex(/^\d{4}-\d{2}$/),
  subscriptionAmount: money,
  commissionAmount: money,
  total: money,
  currency,
  status: StatementStatus,
  communityId: z.string().nullable(),
  createdAt: z.string(),
});
export type Statement = z.infer<typeof Statement>;

/** Estados de cuenta de un sujeto (más recientes primero). */
export const StatementList = z.object({ statements: z.array(Statement) });
export type StatementList = z.infer<typeof StatementList>;
