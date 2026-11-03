import { loadEnv } from '@3b/config';
import { type AppTransaction, createAppDb, withAppContext } from '@3b/db';
import { afterAll, describe, expect, it } from 'vitest';
import { createOrder } from '../../src/modules/orders';
import {
  createShipment,
  getShipment,
  listOpenShipments,
  makeOffer,
} from '../../src/modules/shipping';

// UUIDs del seed determinista.
const ANA = '22222222-2222-2222-2222-222222222202'; // admin de comunidad (ni tienda ni mover)
const CARLOS = '22222222-2222-2222-2222-222222222203'; // miembro de Ferretería (solicita)
const MARTA = '22222222-2222-2222-2222-222222222204'; // miembro de la tienda, NO mover
const PEDRO = '22222222-2222-2222-2222-222222222205'; // Mover aprobado (opera en Coro)
const LUCIA = '22222222-2222-2222-2222-222222222206'; // Maker (comprador)
const FERRETERIA = '33333333-3333-3333-3333-333333333301';
const NEGRO = '66666666-6666-6666-6666-666666666601'; // variante publicada (no se reserva)

const env = loadEnv();
const { db, client } = createAppDb(env.APP_DATABASE_URL);

function asUser<T>(userId: string, fn: (tx: AppTransaction) => Promise<T>) {
  return withAppContext(db, { userId }, fn);
}

afterAll(async () => {
  await client.end();
});

describe('shipping (M6a): solicitud + ofertas de Movers bajo RLS', () => {
  /** Crea un pedido de Lucía (fulfillment dado) y devuelve su id. */
  async function makeOrder(
    fulfillment: 'delivery' | 'pickup',
    key: string,
  ): Promise<string> {
    const res = await asUser(LUCIA, (tx) =>
      createOrder(
        tx,
        LUCIA,
        {
          storeId: FERRETERIA,
          fulfillment,
          items: [{ variantId: NEGRO, qty: 1 }],
          address:
            fulfillment === 'delivery'
              ? { line1: 'Calle 10 #5, Coro' }
              : undefined,
        },
        key,
      ),
    );
    if (res.status !== 'ok')
      throw new Error(`setup createOrder: ${res.status}`);
    return res.order.id;
  }

  /** Carlos (tienda) solicita el envío de un pedido delivery. */
  async function requestShipment(orderId: string): Promise<string> {
    const res = await asUser(CARLOS, (tx) =>
      createShipment(tx, CARLOS, { orderId }),
    );
    if (res.status !== 'ok') throw new Error(`setup shipment: ${res.status}`);
    return res.shipment.id;
  }

  it('el Seller solicita y un Mover oferta → el envío pasa a ofertado', async () => {
    const orderId = await makeOrder('delivery', 'm6a-ok-key');
    const shipmentId = await requestShipment(orderId);

    // Pedro (Mover de Coro) ve la solicitud abierta y oferta.
    const open = await asUser(PEDRO, (tx) => listOpenShipments(tx));
    expect(open.some((s) => s.id === shipmentId)).toBe(true);

    const offered = await asUser(PEDRO, (tx) =>
      makeOffer(tx, shipmentId, PEDRO, { price: '5.00', etaMin: 30 }),
    );
    expect(offered.status).toBe('ok');

    const ship = await asUser(CARLOS, (tx) => getShipment(tx, shipmentId));
    expect(ship?.status).toBe('ofertado'); // el trigger lo movió
    expect(ship?.offers?.some((o) => o.moverId === PEDRO)).toBe(true);
  });

  it('no se puede solicitar envío de un pedido pickup', async () => {
    const orderId = await makeOrder('pickup', 'm6a-pickup-key');
    const res = await asUser(CARLOS, (tx) =>
      createShipment(tx, CARLOS, { orderId }),
    );
    expect(res.status).toBe('not_delivery');
  });

  it('un pedido no tiene dos envíos activos', async () => {
    const orderId = await makeOrder('delivery', 'm6a-dup-key');
    await requestShipment(orderId);
    const again = await asUser(CARLOS, (tx) =>
      createShipment(tx, CARLOS, { orderId }),
    );
    expect(again.status).toBe('already_requested');
  });

  it('un Mover no oferta dos veces el mismo envío (D)', async () => {
    const orderId = await makeOrder('delivery', 'm6a-dupoffer-key');
    const shipmentId = await requestShipment(orderId);
    const first = await asUser(PEDRO, (tx) =>
      makeOffer(tx, shipmentId, PEDRO, { price: '6.00', etaMin: 25 }),
    );
    expect(first.status).toBe('ok');
    const dup = await asUser(PEDRO, (tx) =>
      makeOffer(tx, shipmentId, PEDRO, { price: '4.00', etaMin: 20 }),
    );
    expect(dup.status).toBe('duplicate');
  });

  it('RLS: un no-Mover no puede ofertar; un tercero no ve el envío', async () => {
    const orderId = await makeOrder('delivery', 'm6a-rls-key');
    const shipmentId = await requestShipment(orderId);

    // Marta es de la tienda (ve el envío) pero NO es Mover: la RLS de INSERT la
    // rechaza al ofertar.
    await expect(
      asUser(MARTA, (tx) =>
        makeOffer(tx, shipmentId, MARTA, { price: '3.00', etaMin: 15 }),
      ),
    ).rejects.toThrow();

    // Ana (ni tienda, ni mover, ni comprador) no ve el envío.
    const seen = await asUser(ANA, (tx) => getShipment(tx, shipmentId));
    expect(seen).toBeNull();

    // El comprador (Lucía) sí ve el envío de su pedido.
    const mine = await asUser(LUCIA, (tx) => getShipment(tx, shipmentId));
    expect(mine?.id).toBe(shipmentId);
  });
});
