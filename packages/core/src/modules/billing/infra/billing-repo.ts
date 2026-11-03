import type {
  FeeAccrual,
  FeeAccrualList,
  FeeSubjectType,
  Plan,
  SetSubscriptionInput,
  Subscription,
} from '@3b/contracts';
import { type AppTransaction, and, desc, eq, schema } from '@3b/db';

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
