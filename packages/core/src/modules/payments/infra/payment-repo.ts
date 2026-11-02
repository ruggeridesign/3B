import type { PaymentReport, ReportPaymentInput } from '@3b/contracts';
import { type AppTransaction, and, desc, eq, schema } from '@3b/db';
import { freezeFxRate, getOrder, transitionOrder } from '../../orders';

type ReportRow = typeof schema.paymentReports.$inferSelect;

function toReport(row: ReportRow): PaymentReport {
  return {
    id: row.id,
    orderId: row.orderId,
    method: row.method as PaymentReport['method'],
    amount: row.amount,
    currency: row.currency,
    reference: row.reference,
    status: row.status as PaymentReport['status'],
    note: row.note,
    proofMediaId: row.proofMediaId,
    reportedBy: row.reportedBy,
    reviewedBy: row.reviewedBy,
    reviewedAt: row.reviewedAt ? row.reviewedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Tasa Bs vigente (la más reciente) o null si no hay ninguna cargada. */
async function latestFxRate(db: AppTransaction): Promise<string | null> {
  const [row] = await db
    .select({ usdVes: schema.fxRates.usdVes })
    .from(schema.fxRates)
    .orderBy(desc(schema.fxRates.date))
    .limit(1);
  return row?.usdVes ?? null;
}

/** Reportes de pago de un pedido (más antiguos primero). La RLS los acota. */
export async function listPaymentsForOrder(
  db: AppTransaction,
  orderId: string,
): Promise<PaymentReport[]> {
  const rows = await db
    .select()
    .from(schema.paymentReports)
    .where(eq(schema.paymentReports.orderId, orderId))
    .orderBy(schema.paymentReports.createdAt);
  return rows.map(toReport);
}

/** Resultado de reportar un pago (para mapear a HTTP sin 500). */
export type ReportResult =
  | { status: 'ok'; payment: PaymentReport }
  | { status: 'order_not_found' }
  | { status: 'invalid_state'; current: string }
  | { status: 'duplicate_reference' };

/**
 * El Maker reporta un pago sobre un pedido **aceptado**. Congela la tasa Bs del
 * pedido (P-2), crea el comprobante (`reported`) y mueve el pedido
 * `aceptado → pago_reportado` por la máquina de estados (API pública de `orders`).
 * Idempotencia de referencia: pre-chequea `unique(method, reference)` (P-1) para
 * devolver 409 limpio; el índice único es el candado final. Todo en la
 * transacción del request. La RLS es el candado: solo el Maker dueño inserta.
 */
export async function reportPayment(
  db: AppTransaction,
  orderId: string,
  makerId: string,
  input: ReportPaymentInput,
): Promise<ReportResult> {
  const order = await getOrder(db, orderId);
  if (!order) return { status: 'order_not_found' };
  if (order.status !== 'aceptado') {
    return { status: 'invalid_state', current: order.status };
  }

  // P-1: una referencia (por método) no se reporta dos veces (global).
  const [dup] = await db
    .select({ id: schema.paymentReports.id })
    .from(schema.paymentReports)
    .where(
      and(
        eq(schema.paymentReports.method, input.method),
        eq(schema.paymentReports.reference, input.reference),
      ),
    )
    .limit(1);
  if (dup) return { status: 'duplicate_reference' };

  // P-2: congelar la tasa Bs al reportar (si hay tasa cargada).
  const rate = await latestFxRate(db);
  if (rate) await freezeFxRate(db, orderId, rate);

  const [row] = await db
    .insert(schema.paymentReports)
    .values({
      orderId,
      method: input.method,
      amount: input.amount,
      currency: input.currency,
      reference: input.reference,
      note: input.note ?? null,
      proofMediaId: input.proofMediaId ?? null,
      reportedBy: makerId,
      status: 'reported',
    })
    .returning();

  await transitionOrder(
    db,
    orderId,
    makerId,
    'pago_reportado',
    'Pago reportado por el comprador.',
  );

  return { status: 'ok', payment: toReport(row as ReportRow) };
}

/** Resultado de revisar un pago (para mapear a HTTP sin 500). */
export type ReviewResult =
  | { status: 'ok'; payment: PaymentReport }
  | { status: 'not_found' }
  | { status: 'invalid_state'; current: string };

/**
 * El Seller **confirma** o **rechaza** un reporte de un pedido en
 * `pago_reportado`. Actualiza el comprobante (estado + revisor) y mueve el pedido
 * a `pago_confirmado` o `pago_rechazado`; el rechazo libera la reserva de stock
 * (vía la máquina de estados). La RLS acota la revisión a miembros de la tienda.
 */
export async function reviewPayment(
  db: AppTransaction,
  orderId: string,
  paymentId: string,
  reviewerId: string,
  decision: 'confirm' | 'reject',
  reason: string | null,
): Promise<ReviewResult> {
  const order = await getOrder(db, orderId);
  if (!order) return { status: 'not_found' };
  if (order.status !== 'pago_reportado') {
    return { status: 'invalid_state', current: order.status };
  }

  const [report] = await db
    .select()
    .from(schema.paymentReports)
    .where(
      and(
        eq(schema.paymentReports.id, paymentId),
        eq(schema.paymentReports.orderId, orderId),
      ),
    )
    .limit(1);
  if (!report || report.status !== 'reported') return { status: 'not_found' };

  const [updated] = await db
    .update(schema.paymentReports)
    .set({
      status: decision === 'confirm' ? 'confirmed' : 'rejected',
      reviewedBy: reviewerId,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(schema.paymentReports.id, paymentId))
    .returning();

  const toStatus =
    decision === 'confirm' ? 'pago_confirmado' : 'pago_rechazado';
  const reasonMsg =
    decision === 'confirm'
      ? 'Pago confirmado por la tienda.'
      : (reason ?? 'Pago rechazado por la tienda.');
  await transitionOrder(db, orderId, reviewerId, toStatus, reasonMsg);

  return { status: 'ok', payment: toReport(updated as ReportRow) };
}
