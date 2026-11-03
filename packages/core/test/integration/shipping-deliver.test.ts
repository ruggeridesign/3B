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
import { applyMovement, getLevel } from '../../src/modules/inventory';
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

// UUIDs del seed determinista.
const CARLOS = '22222222-2222-2222-2222-222222222203'; // tienda (solicita)
const PEDRO = '22222222-2222-2222-2222-222222222205'; // Mover aprobado (Coro)
const LUCIA = '22222222-2222-2222-2222-222222222206'; // Maker (comprador)
const FERRETERIA = '33333333-3333-3333-3333-333333333301';

const SLUG = 'test-ship-deliver';

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
      title: 'Ítem de prueba (entrega)',
      priceAmount: '10.00',
      currency: 'USD',
      priceMode: 'fixed',
      status: 'draft',
    }),
  );
  const variant = await asUser(CARLOS, (tx) =>
    createVariant(tx, item.id, { sku: 'SHIP-DELIVER-1', axisValues: {} }),
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

describe('shipping (M6c): entrega con PIN + consume de stock', () => {
  /** Lleva un pedido delivery a `listo` (reserva stock). */
  async function orderListo(key: string, qty: number): Promise<string> {
    const res = await asUser(LUCIA, (tx) =>
      createOrder(
        tx,
        LUCIA,
        {
          storeId: FERRETERIA,
          fulfillment: 'delivery',
          items: [{ variantId: VARIANT, qty }],
          address: { line1: 'Calle 10 #5, Coro' },
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

  /** Solicita el envío, oferta Pedro y Carlos acepta → `asignado` + PIN. */
  async function assign(
    orderId: string,
  ): Promise<{ shipmentId: string; pin: string }> {
    const ship = await asUser(CARLOS, (tx) =>
      createShipment(tx, CARLOS, { orderId }),
    );
    if (ship.status !== 'ok') throw new Error(`shipment: ${ship.status}`);
    const offer = await asUser(PEDRO, (tx) =>
      makeOffer(tx, ship.shipment.id, PEDRO, { price: '5.00', etaMin: 30 }),
    );
    if (offer.status !== 'ok') throw new Error('offer');
    const acc = await asUser(CARLOS, (tx) =>
      acceptOffer(tx, ship.shipment.id, offer.offer.id, CARLOS),
    );
    if (acc.status !== 'ok') throw new Error('accept');
    return { shipmentId: ship.shipment.id, pin: acc.pin };
  }

  /** Avanza el viaje hasta `en_transito` (Pedro). */
  async function toEnTransito(shipmentId: string): Promise<void> {
    for (const to of ['hacia_retiro', 'retirado', 'en_transito'] as const) {
      const r = await asUser(PEDRO, (tx) =>
        progressShipment(tx, shipmentId, PEDRO, to),
      );
      if (r.status !== 'ok') throw new Error(`progress ${to}: ${r.status}`);
    }
  }

  it('entregar con PIN consume el stock y mueve el pedido a entregado→completado', async () => {
    const orderId = await orderListo('m6c-ok-key', 2);
    const { shipmentId, pin } = await assign(orderId);
    await toEnTransito(shipmentId);

    const before = await asUser(CARLOS, (tx) => getLevel(tx, VARIANT));
    expect(before?.reserved).toBe(2); // reservado por el pedido

    const res = await asUser(PEDRO, (tx) =>
      deliverShipment(tx, shipmentId, PEDRO, pin),
    );
    expect(res.status).toBe('ok');
    if (res.status === 'ok') expect(res.shipment.status).toBe('entregado');

    // Consume: on_hand baja 2, reserved vuelve a 0 (venta real).
    const after = await asUser(CARLOS, (tx) => getLevel(tx, VARIANT));
    expect(after?.reserved).toBe(0);
    expect(after?.onHand).toBe((before?.onHand ?? 0) - 2);

    // El pedido pasó en_envio→entregado (trigger de entrega).
    const order = await asUser(CARLOS, (tx) => getOrder(tx, orderId));
    expect(order?.status).toBe('entregado');

    // El comprador confirma → completado (habilita reseñas).
    const done = await asUser(LUCIA, (tx) =>
      transitionOrder(tx, orderId, LUCIA, 'completado', null),
    );
    expect(done.status).toBe('ok');
    if (done.status === 'ok') expect(done.order.status).toBe('completado');
  });

  it('un PIN incorrecto no entrega', async () => {
    const orderId = await orderListo('m6c-badpin-key', 1);
    const { shipmentId, pin } = await assign(orderId);
    await toEnTransito(shipmentId);

    const wrong = String((Number(pin) + 1) % 1_000_000).padStart(6, '0');
    const res = await asUser(PEDRO, (tx) =>
      deliverShipment(tx, shipmentId, PEDRO, wrong),
    );
    expect(res.status).toBe('pin_mismatch');
  });

  it('solo el Mover asignado avanza el viaje', async () => {
    const orderId = await orderListo('m6c-notassigned-key', 1);
    const { shipmentId } = await assign(orderId); // asignado a Pedro

    // Lucía (comprador, ve el envío) no es el Mover asignado.
    const res = await asUser(LUCIA, (tx) =>
      progressShipment(tx, shipmentId, LUCIA, 'hacia_retiro'),
    );
    expect(res.status).toBe('not_assigned');
  });
});
