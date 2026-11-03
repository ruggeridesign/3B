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
  createItem,
  createVariant,
  updateItem,
} from '../../src/modules/catalog';
import { applyMovement } from '../../src/modules/inventory';
import { createOrder, transitionOrder } from '../../src/modules/orders';
import {
  acceptOffer,
  createShipment,
  makeOffer,
} from '../../src/modules/shipping';
import { latestPing, postPing, recentTrack } from '../../src/modules/tracking';

// UUIDs del seed determinista.
const ANA = '22222222-2222-2222-2222-222222222202'; // ni tienda, ni mover, ni comprador
const CARLOS = '22222222-2222-2222-2222-222222222203'; // tienda (solicita)
const PEDRO = '22222222-2222-2222-2222-222222222205'; // Mover aprobado (Coro)
const LUCIA = '22222222-2222-2222-2222-222222222206'; // Maker (comprador)
const FERRETERIA = '33333333-3333-3333-3333-333333333301';

const SLUG = 'test-tracking';

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
      title: 'Ítem de prueba (tracking)',
      priceAmount: '10.00',
      currency: 'USD',
      priceMode: 'fixed',
      status: 'draft',
    }),
  );
  const variant = await asUser(CARLOS, (tx) =>
    createVariant(tx, item.id, { sku: 'TRACK-1', axisValues: {} }),
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

/** Lleva un pedido delivery a `asignado` (Pedro) y devuelve el shipmentId. */
async function assignedShipment(key: string): Promise<string> {
  const order = await asUser(LUCIA, (tx) =>
    createOrder(
      tx,
      LUCIA,
      {
        storeId: FERRETERIA,
        fulfillment: 'delivery',
        items: [{ variantId: VARIANT, qty: 1 }],
        address: { line1: 'Calle 10 #5, Coro' },
      },
      key,
    ),
  );
  if (order.status !== 'ok') throw new Error('order');
  const orderId = order.order.id;
  for (const to of ['aceptado', 'listo'] as const) {
    const r = await asUser(CARLOS, (tx) =>
      transitionOrder(tx, orderId, CARLOS, to, null),
    );
    if (r.status !== 'ok') throw new Error(`${to}`);
  }
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
  return ship.shipment.id;
}

describe('tracking (M6c.2): pings de posición bajo RLS', () => {
  it('el Mover postea su posición y el comprador la ve', async () => {
    const shipmentId = await assignedShipment('m6c2-ok-key');

    const res = await asUser(PEDRO, (tx) =>
      postPing(tx, shipmentId, PEDRO, {
        lat: 11.4,
        lng: -69.67,
        speed: 25,
        heading: 90,
      }),
    );
    expect(res.status).toBe('ok');
    if (res.status === 'ok') {
      expect(res.ping.lat).toBeCloseTo(11.4, 4);
      expect(res.ping.lng).toBeCloseTo(-69.67, 4);
    }

    // El comprador (ve el envío) ve la última posición.
    const latest = await asUser(LUCIA, (tx) => latestPing(tx, shipmentId));
    expect(latest?.lat).toBeCloseTo(11.4, 4);
    const track = await asUser(LUCIA, (tx) => recentTrack(tx, shipmentId));
    expect(track.length).toBeGreaterThanOrEqual(1);
  });

  it('RLS: un no-Mover no postea; un tercero no ve el rastreo', async () => {
    const shipmentId = await assignedShipment('m6c2-rls-key');
    await asUser(PEDRO, (tx) =>
      postPing(tx, shipmentId, PEDRO, { lat: 11.41, lng: -69.68 }),
    );

    // Lucía (comprador) no es el Mover asignado: no puede postear.
    const denied = await asUser(LUCIA, (tx) =>
      postPing(tx, shipmentId, LUCIA, { lat: 0, lng: 0 }),
    );
    expect(denied.status).toBe('not_assigned');

    // Ana (ni tienda, ni mover, ni comprador) no ve el envío → no ve el rastreo.
    const seen = await asUser(ANA, (tx) => latestPing(tx, shipmentId));
    expect(seen).toBeNull();
  });
});
