import { z } from 'zod';
import { PaymentMethodType } from './store';

/**
 * Contratos del módulo `payments`. **M5c — pago por comprobante**: el Maker
 * reporta un pago (método + **referencia única** P-1 + monto) sobre un pedido
 * `aceptado`, que pasa a `pago_reportado`; el Seller lo **confirma**
 * (`pago_confirmado`) o lo **rechaza** (`pago_rechazado`). La tasa Bs
 * (`fx_rate_ves`) se **congela** en el pedido al reportar (P-2). La **captura**
 * (`proofMediaId`) queda prevista pero su subida/visibilidad llega en una
 * rebanada posterior.
 */

const money = z.string().regex(/^\d{1,10}(\.\d{1,2})?$/);
const currency = z.string().regex(/^[A-Z]{3}$/);

/** Estado de un reporte de pago: nace `reported`, el Seller decide. */
export const PaymentStatus = z.enum(['reported', 'confirmed', 'rejected']);
export type PaymentStatus = z.infer<typeof PaymentStatus>;

/** Un reporte de pago (comprobante) sobre un pedido. */
export const PaymentReport = z.object({
  id: z.string(),
  orderId: z.string(),
  method: PaymentMethodType,
  amount: money,
  currency,
  reference: z.string(),
  status: PaymentStatus,
  note: z.string().nullable(),
  proofMediaId: z.string().nullable(),
  reportedBy: z.string(),
  reviewedBy: z.string().nullable(),
  reviewedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type PaymentReport = z.infer<typeof PaymentReport>;

/** Lista de reportes de pago de un pedido. */
export const PaymentReportList = z.object({
  payments: z.array(PaymentReport),
});
export type PaymentReportList = z.infer<typeof PaymentReportList>;

/**
 * El Maker reporta un pago de un pedido. `reference` es la referencia bancaria
 * (única global, P-1). `amount`/`currency` son lo que dice el comprobante.
 */
export const ReportPaymentInput = z.object({
  method: PaymentMethodType,
  reference: z.string().min(2).max(80),
  amount: money,
  currency: currency.default('USD'),
  note: z.string().max(300).optional(),
  proofMediaId: z.string().optional(),
});
export type ReportPaymentInput = z.infer<typeof ReportPaymentInput>;

/** El Seller revisa un reporte: confirma o rechaza (con motivo opcional). */
export const ReviewPaymentInput = z.object({
  decision: z.enum(['confirm', 'reject']),
  reason: z.string().max(300).optional(),
});
export type ReviewPaymentInput = z.infer<typeof ReviewPaymentInput>;

/** Tasa de cambio congelable (BCV): USD→VES por fecha. */
export const FxRate = z.object({
  date: z.string(),
  source: z.string(),
  usdVes: z.string(),
});
export type FxRate = z.infer<typeof FxRate>;
