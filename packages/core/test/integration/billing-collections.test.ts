import { loadEnv } from '@3b/config';
import {
  type AppTransaction,
  createAppDb,
  eq,
  schema,
  withAppContext,
} from '@3b/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  generateStatements,
  getStatement,
  listStatements,
} from '../../src/modules/billing';
import {
  createItem,
  createVariant,
  updateItem,
} from '../../src/modules/catalog';
import { applyMovement } from '../../src/modules/inventory';
import { createOrder, transitionOrder } from '../../src/modules/orders';
import {
  listPaymentsForStatement,
  reportStatementPayment,
  reviewStatementPayment,
} from '../../src/modules/payments';
import { createStore } from '../../src/modules/store';

// UUIDs del seed determinista. Dueño/sujeto = MARTA (miembro de Coro, sin aserciones
// sobre su lista de tiendas en otros tests), para no romper el conteo de tiendas de
// Carlos/Lucía en la DB compartida.
const ANA = '22222222-2222-2222-2222-222222222202'; // admin de comunidad (Coro)
const MARTA = '22222222-2222-2222-2222-222222222204'; // dueña/sujeto de la tienda dedicada
const PEDRO = '22222222-2222-2222-2222-222222222205'; // tercero (ni sujeto ni admin)
const LUCIA = '22222222-2222-2222-2222-222222222206'; // comprador
const CORO = '11111111-1111-1111-1111-111111111101';

const STORE_SLUG = 'test-collections-store';
const ITEM_SLUG = 'test-billing-collections';

const env = loadEnv();
// `app` (RLS) para el flujo; `owner` para el job de sistema (generación).
const app = createAppDb(env.APP_DATABASE_URL);
const owner = createAppDb(env.DATABASE_URL);

function asUser<T>(userId: string, fn: (tx: AppTransaction) => Promise<T>) {
  return withAppContext(app.db, { userId }, fn);
}

function currentPeriod(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

// Tienda DEDICADA (sujeto exclusivo de este test) para que su estado de cuenta no
// lo toque otro archivo en la DB compartida. Nace `trial` → suscripción 0.
let STORE = '';
let VARIANT = '';

beforeAll(async () => {
  const store = await asUser(MARTA, (tx) =>
    createStore(tx, {
      ownerId: MARTA,
      communityId: CORO,
      kind: 'products',
      slug: STORE_SLUG,
      name: 'Tienda de prueba (cobros)',
    }),
  );
  STORE = store.id;

  const item = await asUser(MARTA, (tx) =>
    createItem(tx, {
      storeId: STORE,
      kind: 'product',
      slug: ITEM_SLUG,
      title: 'Ítem de prueba (cobros)',
      priceAmount: '10.00',
      currency: 'USD',
      priceMode: 'fixed',
      status: 'draft',
    }),
  );
  const variant = await asUser(MARTA, (tx) =>
    createVariant(tx, item.id, { sku: 'COLL-1', axisValues: {} }),
  );
  await asUser(MARTA, (tx) =>
    updateItem(tx, { storeId: STORE, id: item.id, status: 'published' }),
  );
  await asUser(MARTA, (tx) =>
    applyMovement(tx, variant.id, MARTA, {
      kind: 'receipt',
      qty: 20,
      channel: 'counter',
    }),
  );
  VARIANT = variant.id;
});

afterAll(async () => {
  await asUser(MARTA, (tx) =>
    tx.delete(schema.items).where(eq(schema.items.slug, ITEM_SLUG)),
  );
  await app.client.end();
  await owner.client.end();
});

/** Pedido pickup de Lucía llevado a `completado` (devenga comisión de venta). */
async function completedOrder(key: string): Promise<void> {
  const res = await asUser(LUCIA, (tx) =>
    createOrder(
      tx,
      LUCIA,
      {
        storeId: STORE,
        fulfillment: 'pickup',
        items: [{ variantId: VARIANT, qty: 1 }],
      },
      key,
    ),
  );
  if (res.status !== 'ok') throw new Error(`order: ${res.status}`);
  const id = res.order.id;
  for (const to of ['aceptado', 'listo', 'retirado'] as const) {
    const r = await asUser(MARTA, (tx) =>
      transitionOrder(tx, id, MARTA, to, null),
    );
    if (r.status !== 'ok') throw new Error(`${to}: ${r.status}`);
  }
  const done = await asUser(LUCIA, (tx) =>
    transitionOrder(tx, id, LUCIA, 'completado', null),
  );
  if (done.status !== 'ok') throw new Error(`completado: ${done.status}`);
}

describe('billing collections (M7c.2): cobro por comprobante (D-03) + RLS', () => {
  it('reporta → pending; rechaza → open; reporta → confirma → paid', async () => {
    await completedOrder('m7c2-order');
    const period = currentPeriod();
    await generateStatements(owner.db, period);

    // El estado de cuenta `open` de la tienda dedicada.
    const list = await asUser(MARTA, (tx) =>
      listStatements(tx, 'store', STORE),
    );
    const st = list.statements.find((s) => s.period === period);
    expect(st).toBeDefined();
    if (!st) return;
    expect(st.status).toBe('open');
    expect(Number(st.commissionAmount)).toBeGreaterThan(0);
    const stmtId = st.id;

    // RLS: un tercero no puede reportar (no ve el estado de cuenta).
    const byThird = await asUser(PEDRO, (tx) =>
      reportStatementPayment(tx, stmtId, PEDRO, {
        method: 'pago_movil',
        reference: 'COLL-THIRD',
        amount: st.total,
        currency: 'USD',
      }),
    );
    expect(byThird.status).toBe('statement_not_found');

    // El sujeto reporta el pago → el estado de cuenta pasa a `pending` (trigger).
    const r1 = await asUser(MARTA, (tx) =>
      reportStatementPayment(tx, stmtId, MARTA, {
        method: 'pago_movil',
        reference: 'COLL-R1',
        amount: st.total,
        currency: 'USD',
      }),
    );
    expect(r1.status).toBe('ok');
    const pending = await asUser(MARTA, (tx) => getStatement(tx, stmtId));
    expect(pending?.status).toBe('pending');

    // RLS: el sujeto (no admin) NO puede confirmar su propio cobro.
    if (r1.status !== 'ok') return;
    const subjectReview = await asUser(MARTA, (tx) =>
      reviewStatementPayment(tx, stmtId, r1.payment.id, MARTA, 'confirm'),
    );
    expect(subjectReview.status).toBe('not_found');

    // El admin de la comunidad rechaza → vuelve a `open` (reintento).
    const reject = await asUser(ANA, (tx) =>
      reviewStatementPayment(tx, stmtId, r1.payment.id, ANA, 'reject'),
    );
    expect(reject.status).toBe('ok');
    const reopened = await asUser(MARTA, (tx) => getStatement(tx, stmtId));
    expect(reopened?.status).toBe('open');

    // El sujeto reporta de nuevo (otra referencia) → `pending`.
    const r2 = await asUser(MARTA, (tx) =>
      reportStatementPayment(tx, stmtId, MARTA, {
        method: 'transferencia',
        reference: 'COLL-R2',
        amount: st.total,
        currency: 'USD',
      }),
    );
    expect(r2.status).toBe('ok');
    if (r2.status !== 'ok') return;

    // El admin confirma → `paid`.
    const confirm = await asUser(ANA, (tx) =>
      reviewStatementPayment(tx, stmtId, r2.payment.id, ANA, 'confirm'),
    );
    expect(confirm.status).toBe('ok');
    const paid = await asUser(MARTA, (tx) => getStatement(tx, stmtId));
    expect(paid?.status).toBe('paid');

    // Historial: R1 quedó `rejected`, R2 `confirmed`. Un tercero no lo ve (RLS).
    const reports = await asUser(MARTA, (tx) =>
      listPaymentsForStatement(tx, stmtId),
    );
    const byRef = new Map(reports.map((p) => [p.reference, p.status]));
    expect(byRef.get('COLL-R1')).toBe('rejected');
    expect(byRef.get('COLL-R2')).toBe('confirmed');

    const third = await asUser(PEDRO, (tx) =>
      listPaymentsForStatement(tx, stmtId),
    );
    expect(third).toHaveLength(0);
  });
});
