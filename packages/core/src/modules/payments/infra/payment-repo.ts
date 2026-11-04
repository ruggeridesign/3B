import type { PaymentReport, ReportPaymentInput } from '@3b/contracts';
import { type AppTransaction, and, desc, eq, schema } from '@3b/db';
import { getStatement } from '../../billing';
import { freezeFxRate, getOrder, transitionOrder } from '../../orders';

type ReportRow = typeof schema.paymentReports.$inferSelect;

function toReport(row: ReportRow): PaymentReport {
  return {
    id: row.id,
    orderId: row.orderId,
    statementId: row.statementId,
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

/** ¿Esa referencia (por método) ya fue reportada? (P-1, único global). */
async function referenceTaken(
  db: AppTransaction,
  method: string,
  reference: string,
): Promise<boolean> {
  const [dup] = await db
    .select({ id: schema.paymentReports.id })
    .from(schema.paymentReports)
    .where(
      and(
        eq(schema.paymentReports.method, method),
        eq(schema.paymentReports.reference, reference),
      ),
    )
    .limit(1);
  return Boolean(dup);
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
  if (await referenceTaken(db, input.method, input.reference)) {
    return { status: 'duplicate_reference' };
  }

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

// ── Cobro de estados de cuenta (M7c.2, D-03) ─────────────────────────────────

/** Reportes de pago de un estado de cuenta (más antiguos primero). RLS los acota. */
export async function listPaymentsForStatement(
  db: AppTransaction,
  statementId: string,
): Promise<PaymentReport[]> {
  const rows = await db
    .select()
    .from(schema.paymentReports)
    .where(eq(schema.paymentReports.statementId, statementId))
    .orderBy(schema.paymentReports.createdAt);
  return rows.map(toReport);
}

/** Resultado de reportar el pago de un estado de cuenta. */
export type ReportStatementResult =
  | { status: 'ok'; payment: PaymentReport }
  | { status: 'statement_not_found' }
  | { status: 'invalid_state'; current: string }
  | { status: 'duplicate_reference' };

/**
 * El **sujeto** (tienda/Mover) reporta el pago de un estado de cuenta `open`. Crea el
 * comprobante (`reported`) con `statement_id`; el trigger definer mueve el estado de
 * cuenta `open→pending`. P-1: la referencia es única global. La RLS es el candado:
 * solo el sujeto del estado de cuenta inserta (y se registra a sí mismo como reporter).
 */
export async function reportStatementPayment(
  db: AppTransaction,
  statementId: string,
  reporterId: string,
  input: ReportPaymentInput,
): Promise<ReportStatementResult> {
  const statement = await getStatement(db, statementId);
  if (!statement) return { status: 'statement_not_found' };
  if (statement.status !== 'open') {
    return { status: 'invalid_state', current: statement.status };
  }

  if (await referenceTaken(db, input.method, input.reference)) {
    return { status: 'duplicate_reference' };
  }

  const [row] = await db
    .insert(schema.paymentReports)
    .values({
      statementId,
      method: input.method,
      amount: input.amount,
      currency: input.currency,
      reference: input.reference,
      note: input.note ?? null,
      proofMediaId: input.proofMediaId ?? null,
      reportedBy: reporterId,
      status: 'reported',
    })
    .returning();

  return { status: 'ok', payment: toReport(row as ReportRow) };
}

/** Resultado de revisar el pago de un estado de cuenta. */
export type ReviewStatementResult =
  | { status: 'ok'; payment: PaymentReport }
  | { status: 'not_found' }
  | { status: 'invalid_state'; current: string };

/**
 * Un **admin** (de la comunidad del estado de cuenta, o de plataforma) confirma o
 * rechaza el cobro de un estado de cuenta `pending`. Actualiza el comprobante (estado +
 * revisor); el trigger definer mueve el estado de cuenta a `paid` (confirmar) o lo
 * devuelve a `open` (rechazar, para reintento). La RLS acota la revisión a admins.
 */
export async function reviewStatementPayment(
  db: AppTransaction,
  statementId: string,
  paymentId: string,
  reviewerId: string,
  decision: 'confirm' | 'reject',
): Promise<ReviewStatementResult> {
  const statement = await getStatement(db, statementId);
  if (!statement) return { status: 'not_found' };
  if (statement.status !== 'pending') {
    return { status: 'invalid_state', current: statement.status };
  }

  const [report] = await db
    .select()
    .from(schema.paymentReports)
    .where(
      and(
        eq(schema.paymentReports.id, paymentId),
        eq(schema.paymentReports.statementId, statementId),
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
  if (!updated) return { status: 'not_found' };

  return { status: 'ok', payment: toReport(updated as ReportRow) };
}
