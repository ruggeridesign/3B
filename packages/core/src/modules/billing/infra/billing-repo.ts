import type {
  FeeAccrual,
  FeeAccrualList,
  FeeSubjectType,
  Plan,
  SetSubscriptionInput,
  Statement,
  StatementList,
  Subscription,
} from '@3b/contracts';
import {
  type AppDatabase,
  type AppTransaction,
  and,
  desc,
  eq,
  schema,
  sql,
} from '@3b/db';

type PlanRow = typeof schema.plans.$inferSelect;
type SubRow = typeof schema.subscriptions.$inferSelect;

function toPlan(row: PlanRow): Plan {
  return {
    id: row.id,
    code: row.code as Plan['code'],
    name: row.name,
    priceAmount: row.priceAmount,
    currency: row.currency,
  };
}

function toSubscription(sub: SubRow, plan: PlanRow): Subscription {
  return {
    id: sub.id,
    storeId: sub.storeId,
    planId: sub.planId,
    planCode: plan.code as Subscription['planCode'],
    planName: plan.name,
    priceAmount: plan.priceAmount,
    currency: plan.currency,
    status: sub.status as Subscription['status'],
    periodEnd: sub.periodEnd ? sub.periodEnd.toISOString() : null,
    createdAt: sub.createdAt.toISOString(),
  };
}

/** Planes disponibles (lectura pública). */
export async function listPlans(db: AppTransaction): Promise<Plan[]> {
  const rows = await db.select().from(schema.plans).orderBy(schema.plans.code);
  return rows.map(toPlan);
}

/** Suscripción de una tienda (con su plan), o null si no es visible. */
export async function getSubscription(
  db: AppTransaction,
  storeId: string,
): Promise<Subscription | null> {
  const [row] = await db
    .select({ sub: schema.subscriptions, plan: schema.plans })
    .from(schema.subscriptions)
    .innerJoin(schema.plans, eq(schema.plans.id, schema.subscriptions.planId))
    .where(eq(schema.subscriptions.storeId, storeId))
    .limit(1);
  if (!row) return null;
  return toSubscription(row.sub, row.plan);
}

/** Resultado de fijar la suscripción (para mapear a HTTP sin 500). */
export type SetSubscriptionResult =
  | { status: 'ok'; subscription: Subscription }
  | { status: 'not_found' }
  | { status: 'invalid_plan' };

/**
 * Un admin (de comunidad o plataforma) fija el estado/plan de una suscripción. La
 * RLS es el candado: a un no-admin no le afecta ninguna fila (→ `not_found`). El
 * alta (`trial`) la hace el trigger al crear la tienda; acá solo se actualiza.
 */
export async function setSubscription(
  db: AppTransaction,
  storeId: string,
  input: SetSubscriptionInput,
): Promise<SetSubscriptionResult> {
  let planId: string | undefined;
  if (input.planCode) {
    const [p] = await db
      .select({ id: schema.plans.id })
      .from(schema.plans)
      .where(eq(schema.plans.code, input.planCode))
      .limit(1);
    if (!p) return { status: 'invalid_plan' };
    planId = p.id;
  }

  const [updated] = await db
    .update(schema.subscriptions)
    .set({
      status: input.status,
      ...(planId ? { planId } : {}),
      ...(input.periodEnd ? { periodEnd: new Date(input.periodEnd) } : {}),
      updatedAt: new Date(),
    })
    .where(eq(schema.subscriptions.storeId, storeId))
    .returning();
  if (!updated) return { status: 'not_found' };

  const sub = await getSubscription(db, storeId);
  return { status: 'ok', subscription: sub as Subscription };
}

type FeeRow = typeof schema.feeAccruals.$inferSelect;

function toFeeAccrual(row: FeeRow): FeeAccrual {
  return {
    id: row.id,
    subjectType: row.subjectType as FeeAccrual['subjectType'],
    subjectId: row.subjectId,
    kind: row.kind as FeeAccrual['kind'],
    amount: row.amount,
    currency: row.currency,
    communityId: row.communityId,
    orderId: row.orderId,
    shipmentId: row.shipmentId,
    accruedAt: row.accruedAt.toISOString(),
  };
}

/**
 * Comisiones devengadas de un sujeto (tienda o Mover), recientes primero, con su
 * **total**. La RLS acota la visibilidad (el sujeto o un admin). El total se suma en
 * centavos para no arrastrar error de punto flotante.
 */
export async function listFeeAccruals(
  db: AppTransaction,
  subjectType: FeeSubjectType,
  subjectId: string,
): Promise<FeeAccrualList> {
  const rows = await db
    .select()
    .from(schema.feeAccruals)
    .where(
      and(
        eq(schema.feeAccruals.subjectType, subjectType),
        eq(schema.feeAccruals.subjectId, subjectId),
      ),
    )
    .orderBy(desc(schema.feeAccruals.accruedAt));

  const cents = rows.reduce(
    (s, r) => s + Math.round(Number(r.amount) * 100),
    0,
  );
  const currency = rows[0]?.currency ?? 'USD';
  return {
    accruals: rows.map(toFeeAccrual),
    total: (cents / 100).toFixed(2),
    currency,
  };
}

type StatementRow = typeof schema.statements.$inferSelect;

function toStatement(row: StatementRow): Statement {
  return {
    id: row.id,
    subjectType: row.subjectType as Statement['subjectType'],
    subjectId: row.subjectId,
    period: row.period,
    subscriptionAmount: row.subscriptionAmount,
    commissionAmount: row.commissionAmount,
    total: row.total,
    currency: row.currency,
    status: row.status as Statement['status'],
    communityId: row.communityId,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Estados de cuenta de un sujeto (tienda o Mover), más recientes primero. La RLS
 * acota la visibilidad (el sujeto o un admin).
 */
export async function listStatements(
  db: AppTransaction,
  subjectType: FeeSubjectType,
  subjectId: string,
): Promise<StatementList> {
  const rows = await db
    .select()
    .from(schema.statements)
    .where(
      and(
        eq(schema.statements.subjectType, subjectType),
        eq(schema.statements.subjectId, subjectId),
      ),
    )
    .orderBy(desc(schema.statements.period));
  return { statements: rows.map(toStatement) };
}

/** Un estado de cuenta por id (o null si no es visible bajo RLS). */
export async function getStatement(
  db: AppTransaction,
  id: string,
): Promise<Statement | null> {
  const [row] = await db
    .select()
    .from(schema.statements)
    .where(eq(schema.statements.id, id))
    .limit(1);
  return row ? toStatement(row) : null;
}

/**
 * Estados de cuenta **pendientes de confirmación de cobro** (`pending`), más recientes
 * primero. Para el panel del admin (cobros por confirmar): la RLS los acota a lo que ve
 * el que consulta (un admin ve los de su comunidad/plataforma; el sujeto, el propio).
 */
export async function listPendingStatements(
  db: AppTransaction,
): Promise<StatementList> {
  const rows = await db
    .select()
    .from(schema.statements)
    .where(eq(schema.statements.status, 'pending'))
    .orderBy(desc(schema.statements.period));
  return { statements: rows.map(toStatement) };
}

/**
 * Genera/actualiza los estados de cuenta de un período (`YYYY-MM`). **Job de
 * sistema**: corre con la conexión **owner** (el worker), delega la agregación a la
 * función SQL `billing.generate_statements` (SECURITY DEFINER). Idempotente: solo
 * refresca los estados `open` del período. Devuelve cuántos sujetos procesó.
 */
export async function generateStatements(
  db: AppDatabase,
  period: string,
): Promise<number> {
  const rows = (await db.execute(
    sql`SELECT billing.generate_statements(${period}) AS count`,
  )) as unknown as Array<{ count: number }>;
  return Number(rows[0]?.count ?? 0);
}
