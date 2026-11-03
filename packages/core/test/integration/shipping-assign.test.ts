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
import {
  createOrder,
  getOrder,
  transitionOrder,
} from '../../src/modules/orders';
import {
  acceptOffer,
  createShipment,
  listMoverShipments,
  listShipmentOffers,
  makeOffer,
} from '../../src/modules/shipping';

// UUIDs del seed determinista.
const CARLOS = '22222222-2222-2222-2222-222222222203'; // owner de Ferretería (solicita)
const MARTA = '22222222-2222-2222-2222-222222222204'; // 2º Mover (alta en beforeAll)
const PEDRO = '22222222-2222-2222-2222-222222222205'; // Mover aprobado (Coro)
const LUCIA = '22222222-2222-2222-2222-222222222206'; // Maker (comprador)
const CORO = '11111111-1111-1111-1111-111111111101';
const FERRETERIA = '33333333-3333-3333-3333-333333333301';

const SLUG = 'test-ship-assign';

const env = loadEnv();
const app = createAppDb(env.APP_DATABASE_URL);
const owner = createAppDb(env.DATABASE_URL); // alta del 2º Mover (bypassa RLS)

function asUser<T>(userId: string, fn: (tx: AppTransaction) => Promise<T>) {
  return withAppContext(app.db, { userId }, fn);
}

// Variante dedicada: aceptar un pedido reserva stock (y no se libera), así que no
// comparte variante con orders/inventory.
let VARIANT = '';

beforeAll(async () => {
  const item = await asUser(CARLOS, (tx) =>
    createItem(tx, {
      storeId: FERRETERIA,
      kind: 'product',
      slug: SLUG,
      title: 'Ítem de prueba (envío)',
      priceAmount: '10.00',
      currency: 'USD',
      priceMode: 'fixed',
      status: 'draft',
    }),
  );
  const variant = await asUser(CARLOS, (tx) =>
    createVariant(tx, item.id, { sku: 'SHIP-ASSIGN-1', axisValues: {} }),
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

  // Marta como 2º Mover aprobado en Coro (para probar el rechazo de ofertas).
  await owner.db
    .insert(schema.moverProfiles)
    .values({ userId: MARTA, status: 'approved', operatingCommunities: [CORO] })
    .onConflictDoNothing();
});

afterAll(async () => {
  await owner.db
    .delete(schema.moverProfiles)
    .where(eq(schema.moverProfiles.userId, MARTA));
  await asUser(CARLOS, (tx) =>
    tx.delete(schema.items).where(eq(schema.items.slug, SLUG)),
  );
  await app.client.end();
  await owner.client.end();
});

describe('shipping (M6b): asignación + PIN bajo RLS', () => {
  /** Pedido delivery de Lucía; opcionalmente llevado a `listo`. */
  async function deliveryOrder(key: string, toListo: boolean): Promise<string> {
    const res = await asUser(LUCIA, (tx) =>
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
    if (res.status !== 'ok') throw new Error(`setup order: ${res.status}`);
    const orderId = res.order.id;
    if (toListo) {
      for (const to of ['aceptado', 'listo'] as const) {
        const r = await asUser(CARLOS, (tx) =>
          transitionOrder(tx, orderId, CARLOS, to, null),
        );
        if (r.status !== 'ok') throw new Error(`setup ${to}: ${r.status}`);
      }
    }
    return orderId;
  }

  async function requestShipment(orderId: string): Promise<string> {
    const res = await asUser(CARLOS, (tx) =>
      createShipment(tx, CARLOS, { orderId }),
    );
    if (res.status !== 'ok') throw new Error(`setup shipment: ${res.status}`);
    return res.shipment.id;
  }

  it('aceptar una oferta asigna el Mover + PIN y mueve el pedido a en_envio', async () => {
    const orderId = await deliveryOrder('m6b-ok-key', true);
    const shipmentId = await requestShipment(orderId);
    const pedro = await asUser(PEDRO, (tx) =>
      makeOffer(tx, shipmentId, PEDRO, { price: '5.00', etaMin: 30 }),
    );
    const marta = await asUser(MARTA, (tx) =>
      makeOffer(tx, shipmentId, MARTA, { price: '7.00', etaMin: 20 }),
    );
    if (pedro.status !== 'ok' || marta.status !== 'ok') {
      throw new Error('setup offers');
    }

    const res = await asUser(CARLOS, (tx) =>
      acceptOffer(tx, shipmentId, pedro.offer.id, CARLOS),
    );
    expect(res.status).toBe('ok');
    if (res.status === 'ok') {
      expect(res.pin).toMatch(/^\d{6}$/); // PIN de 6 dígitos (solo se guarda el hash)
      expect(res.shipment.status).toBe('asignado');
      expect(res.shipment.moverId).toBe(PEDRO);
      expect(res.shipment.agreedPrice).toBe('5.00');
    }

    // El pedido pasó a en_envio (shipping disparó la transición).
    const order = await asUser(CARLOS, (tx) => getOrder(tx, orderId));
    expect(order?.status).toBe('en_envio');

    // La oferta de Pedro quedó aceptada; la de Marta, rechazada (S-2).
    const offers = await asUser(CARLOS, (tx) =>
      listShipmentOffers(tx, shipmentId),
    );
    expect(offers.find((o) => o.moverId === PEDRO)?.status).toBe('accepted');
    expect(offers.find((o) => o.moverId === MARTA)?.status).toBe('rejected');

    // Pedro ve su viaje asignado.
    const trips = await asUser(PEDRO, (tx) => listMoverShipments(tx, PEDRO));
    expect(trips.some((s) => s.id === shipmentId)).toBe(true);
  });

  it('no se puede asignar si el pedido no está listo', async () => {
    const orderId = await deliveryOrder('m6b-notready-key', false); // queda realizado
    const shipmentId = await requestShipment(orderId);
    const offer = await asUser(PEDRO, (tx) =>
      makeOffer(tx, shipmentId, PEDRO, { price: '5.00', etaMin: 30 }),
    );
    if (offer.status !== 'ok') throw new Error('setup offer');

    const res = await asUser(CARLOS, (tx) =>
      acceptOffer(tx, shipmentId, offer.offer.id, CARLOS),
    );
    expect(res.status).toBe('order_not_ready');
  });
});
