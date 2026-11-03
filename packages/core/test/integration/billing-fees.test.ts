import { loadEnv } from '@3b/config';
import {
  type AppTransaction,
  createAppDb,
  eq,
  schema,
  withAppContext,
} from '@3b/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { listFeeAccruals } from '../../src/modules/billing';
import {
  createItem,
  createVariant,
  updateItem,
} from '../../src/modules/catalog';
import { applyMovement } from '../../src/modules/inventory';
import {
  createOrder,
  getOrder,
  transitionOrder,
} from '../../src/modules/orders';
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

const SLUG = 'test-billing-fees';

const env = loadEnv();
const { db, client } = createAppDb(env.APP_DATABASE_URL);

function asUser<T>(userId: string, fn: (tx: AppTransaction) => Promise<T>) {
  return withAppContext(db, { userId }, fn);
}

let VARIANT = '';

beforeAll(async () => {
  const item = await asUser(CARLOS, (tx) =>
    createItem(tx, {
      storeId: FERRETERIA,
      kind: 'product',
      slug: SLUG,
      title: 'Ítem de prueba (comisiones)',
      priceAmount: '10.00',
      currency: 'USD',
      priceMode: 'fixed',
      status: 'draft',
    }),
  );
  const variant = await asUser(CARLOS, (tx) =>
    createVariant(tx, item.id, { sku: 'FEES-1', axisValues: {} }),
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
  await client.end();
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

describe('billing fees (M7b): devengo de comisiones bajo RLS', () => {
  it('la venta al completado devenga comisión a la tienda (+ fee_amount)', async () => {
    const orderId = await orderListo('m7b-sale-key', 'pickup');
    await asUser(CARLOS, (tx) =>
      transitionOrder(tx, orderId, CARLOS, 'retirado', null),
    );
    await asUser(LUCIA, (tx) =>
      transitionOrder(tx, orderId, LUCIA, 'completado', null),
    );

    // fee_amount grabado en el pedido (10.00 * 0.05).
    const order = await asUser(CARLOS, (tx) => getOrder(tx, orderId));
    expect(order?.feeAmount).toBe('0.50');

    // Comisión de venta visible a la tienda; no a un tercero; sí a un admin.
    const mine = await asUser(CARLOS, (tx) =>
      listFeeAccruals(tx, 'store', FERRETERIA),
    );
    const sale = mine.accruals.find((a) => a.orderId === orderId);
    expect(sale?.kind).toBe('sale');
    expect(sale?.amount).toBe('0.50');

    const third = await asUser(PEDRO, (tx) =>
      listFeeAccruals(tx, 'store', FERRETERIA),
    );
    expect(third.accruals).toHaveLength(0);

    const admin = await asUser(ANA, (tx) =>
      listFeeAccruals(tx, 'store', FERRETERIA),
    );
    expect(admin.accruals.some((a) => a.orderId === orderId)).toBe(true);
  });

  it('el envío al entregado devenga comisión al Mover (S-3)', async () => {
    const orderId = await orderListo('m7b-ship-key', 'delivery');
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

    // Comisión de envío al Mover (5.00 * 0.05 = 0.25).
    const fees = await asUser(PEDRO, (tx) =>
      listFeeAccruals(tx, 'mover', PEDRO),
    );
    const shipFee = fees.accruals.find(
      (a) => a.shipmentId === ship.shipment.id,
    );
    expect(shipFee?.kind).toBe('shipment');
    expect(shipFee?.amount).toBe('0.25');
    expect(shipFee?.subjectId).toBe(PEDRO);
  });
});
