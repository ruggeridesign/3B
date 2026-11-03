import type { Plan, SetSubscriptionInput, Subscription } from '@3b/contracts';
import { type AppTransaction, eq, schema } from '@3b/db';

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
