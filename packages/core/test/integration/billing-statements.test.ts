import { loadEnv } from '@3b/config';
import {
  type AppTransaction,
  createAppDb,
  eq,
  schema,
  withAppContext,
} from '@3b/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generateStatements, listStatements } from '../../src/modules/billing';
import {
  createItem,
  createVariant,
  updateItem,
} from '../../src/modules/catalog';
import { applyMovement } from '../../src/modules/inventory';
import { createOrder, transitionOrder } from '../../src/modules/orders';
import {
  acceptOffer,
  createShipment,
  deliverShipment,
  makeOffer,
  progressShipment,
} from '../../src/modules/shipping';

// UUIDs del seed determinista. Comisión = 0.05 (seed de billing.config).
const ANA = '22222222-2222-2222-2222-222222222202'; // admin de comunidad (Coro)
const CARLOS = '22222222-2222-2222-2222-222222222203'; // tienda
const PEDRO = '22222222-2222-2222-2222-222222222205'; // Mover
const LUCIA = '22222222-2222-2222-2222-222222222206'; // comprador
const FERRETERIA = '33333333-3333-3333-3333-333333333301';

const SLUG = 'test-billing-statements';

const env = loadEnv();
// `app` (RLS) para el flujo de negocio; `owner` para el job de sistema (generación).
const app = createAppDb(env.APP_DATABASE_URL);
const owner = createAppDb(env.DATABASE_URL);

function asUser<T>(userId: string, fn: (tx: AppTransaction) => Promise<T>) {
  return withAppContext(app.db, { userId }, fn);
}

/** Período `YYYY-MM` (UTC) actual: el mismo que usa el worker. */
function currentPeriod(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

let VARIANT = '';

beforeAll(async () => {
  const item = await asUser(CARLOS, (tx) =>
    createItem(tx, {
      storeId: FERRETERIA,
      kind: 'product',
      slug: SLUG,
      title: 'Ítem de prueba (estados de cuenta)',
      priceAmount: '10.00',
      currency: 'USD',
      priceMode: 'fixed',
      status: 'draft',
    }),
  );
  const variant = await asUser(CARLOS, (tx) =>
    createVariant(tx, item.id, { sku: 'STMT-1', axisValues: {} }),
  );
  await asUser(CARLOS, (tx) =>
    updateItem(tx, { storeId: FERRETERIA, id: item.id, status: 'published' }),
  );
  await asUser(CARLOS, (tx) =>
    applyMovement(tx, variant.id, CARLOS, {
      kind: 'receipt',
      qty: 20,
      channel: 'counter',
    }),
  );
  VARIANT = variant.id;
});

afterAll(async () => {
  await asUser(CARLOS, (tx) =>
    tx.delete(schema.items).where(eq(schema.items.slug, SLUG)),
  );
  await app.client.end();
  await owner.client.end();
});

/** Pedido (fulfillment dado) de Lucía, llevado a `listo`. */
async function orderListo(
  key: string,
  fulfillment: 'pickup' | 'delivery',
): Promise<string> {
  const res = await asUser(LUCIA, (tx) =>
    createOrder(
      tx,
      LUCIA,
      {
        storeId: FERRETERIA,
        fulfillment,
        items: [{ variantId: VARIANT, qty: 1 }],
        ...(fulfillment === 'delivery'
          ? { address: { line1: 'Calle 10 #5, Coro' } }
          : {}),
      },
      key,
    ),
  );
  if (res.status !== 'ok') throw new Error(`order: ${res.status}`);
  const orderId = res.order.id;
  for (const to of ['aceptado', 'listo'] as const) {
    const r = await asUser(CARLOS, (tx) =>
      transitionOrder(tx, orderId, CARLOS, to, null),
    );
    if (r.status !== 'ok') throw new Error(`${to}: ${r.status}`);
  }
  return orderId;
}

describe('billing statements (M7c.1): generación + RLS', () => {
  it('genera el estado de cuenta de la tienda (suscripción + comisiones) bajo RLS', async () => {
    // Una venta completada → comisión de venta a la tienda en el período actual.
    const orderId = await orderListo('m7c-store-key', 'pickup');
    await asUser(CARLOS, (tx) =>
      transitionOrder(tx, orderId, CARLOS, 'retirado', null),
    );
    await asUser(LUCIA, (tx) =>
      transitionOrder(tx, orderId, LUCIA, 'completado', null),
    );

    const period = currentPeriod();
    const n = await generateStatements(owner.db, period);
    expect(n).toBeGreaterThanOrEqual(1);

    // La tienda ve su estado de cuenta del período (lo gestiona CARLOS, miembro).
    const mine = await asUser(CARLOS, (tx) =>
      listStatements(tx, 'store', FERRETERIA),
    );
    const st = mine.statements.find((s) => s.period === period);
    expect(st).toBeDefined();
    if (!st) return;
    expect(st.subjectType).toBe('store');
    expect(st.subjectId).toBe(FERRETERIA);
    expect(st.communityId).not.toBeNull(); // store → alcance de comunidad
    expect(['open', 'pending', 'paid']).toContain(st.status);
    // Consistencia interna: total = suscripción + comisiones (siempre).
    expect(Number(st.total)).toBeCloseTo(
      Number(st.subscriptionAmount) + Number(st.commissionAmount),
      2,
    );
    // La venta de este test garantiza comisión > 0 en el período.
    expect(Number(st.commissionAmount)).toBeGreaterThan(0);

    // RLS: un tercero (ni miembro ni admin) no ve el estado de cuenta de la tienda.
    const third = await asUser(PEDRO, (tx) =>
      listStatements(tx, 'store', FERRETERIA),
    );
    expect(third.statements).toHaveLength(0);

    // Un admin de la comunidad sí lo ve.
    const admin = await asUser(ANA, (tx) =>
      listStatements(tx, 'store', FERRETERIA),
    );
    expect(admin.statements.some((s) => s.period === period)).toBe(true);
  });

  it('genera el estado de cuenta del Mover (solo comisiones; sin comunidad) bajo RLS', async () => {
    // Un envío entregado → comisión al Mover en el período actual (S-3).
    const orderId = await orderListo('m7c-mover-key', 'delivery');
    const ship = await asUser(CARLOS, (tx) =>
      createShipment(tx, CARLOS, { orderId }),
    );
    if (ship.status !== 'ok') throw new Error('shipment');
    const offer = await asUser(PEDRO, (tx) =>
      makeOffer(tx, ship.shipment.id, PEDRO, { price: '5.00', etaMin: 30 }),
    );
    if (offer.status !== 'ok') throw new Error('offer');
    const acc = await asUser(CARLOS, (tx) =>
      acceptOffer(tx, ship.shipment.id, offer.offer.id, CARLOS),
    );
    if (acc.status !== 'ok') throw new Error('accept');
    for (const to of ['hacia_retiro', 'retirado', 'en_transito'] as const) {
      await asUser(PEDRO, (tx) =>
        progressShipment(tx, ship.shipment.id, PEDRO, to),
      );
    }
    const del = await asUser(PEDRO, (tx) =>
      deliverShipment(tx, ship.shipment.id, PEDRO, acc.pin),
    );
    expect(del.status).toBe('ok');

    const period = currentPeriod();
    await generateStatements(owner.db, period);

    // El Mover ve su estado de cuenta del período (sin suscripción, sin comunidad).
    const mine = await asUser(PEDRO, (tx) =>
      listStatements(tx, 'mover', PEDRO),
    );
    const st = mine.statements.find((s) => s.period === period);
    expect(st).toBeDefined();
    if (!st) return;
    expect(st.subjectType).toBe('mover');
    expect(st.subjectId).toBe(PEDRO);
    expect(st.communityId).toBeNull(); // mover → billing de plataforma
    expect(Number(st.subscriptionAmount)).toBe(0);
    expect(Number(st.total)).toBeCloseTo(Number(st.commissionAmount), 2);
    expect(Number(st.commissionAmount)).toBeGreaterThan(0);

    // RLS: una tienda ajena no ve el estado de cuenta del Mover.
    const third = await asUser(CARLOS, (tx) =>
      listStatements(tx, 'mover', PEDRO),
    );
    expect(third.statements).toHaveLength(0);
  });
});
