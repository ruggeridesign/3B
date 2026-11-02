import { loadEnv } from '@3b/config';
import { type AppTransaction, createAppDb, withAppContext } from '@3b/db';
import { afterAll, describe, expect, it } from 'vitest';
import {
  createOrder,
  getOrder,
  listMyOrders,
  listStoreOrders,
} from '../../src/modules/orders';

// UUIDs del seed determinista.
const CARLOS = '22222222-2222-2222-2222-222222222203'; // owner de Ferretería
const PEDRO = '22222222-2222-2222-2222-222222222205'; // Punto Fijo: ni Maker ni miembro
const LUCIA = '22222222-2222-2222-2222-222222222206'; // Maker (Coro)
const FERRETERIA = '33333333-3333-3333-3333-333333333301'; // tienda de Carlos (Coro)
const NEGRO = '66666666-6666-6666-6666-666666666601'; // variante del taladro (ítem $49.90)

const env = loadEnv();
const { db, client } = createAppDb(env.APP_DATABASE_URL);

function asUser<T>(userId: string, fn: (tx: AppTransaction) => Promise<T>) {
  return withAppContext(db, { userId }, fn);
}

afterAll(async () => {
  await client.end();
});

describe('orders (M5a): checkout → pedido realizado bajo RLS', () => {
  it('el Maker crea un pedido con precios congelados y evento de creación', async () => {
    const res = await asUser(LUCIA, (tx) =>
      createOrder(
        tx,
        LUCIA,
        {
          storeId: FERRETERIA,
          fulfillment: 'pickup',
          items: [{ variantId: NEGRO, qty: 2 }],
        },
        'test-order-key-1',
      ),
    );
    expect(res.status).toBe('ok');
    if (res.status !== 'ok') return;
    const o = res.order;
    expect(o.status).toBe('realizado');
    expect(o.number).toBeGreaterThanOrEqual(1000);
    expect(o.subtotal).toBe('99.80'); // 49.90 × 2
    expect(o.total).toBe('99.80'); // sin envío ni comisión en M5a
    expect(o.items).toHaveLength(1);
    expect(o.items[0]?.sku).toBe('TAL-650-NEGRO');
    expect(o.items[0]?.unitPrice).toBe('49.90');
    expect(o.events?.some((e) => e.toStatus === 'realizado')).toBe(true);
  });

  it('es idempotente por Idempotency-Key (no duplica)', async () => {
    const before = await asUser(LUCIA, (tx) => listMyOrders(tx, LUCIA));
    const again = await asUser(LUCIA, (tx) =>
      createOrder(
        tx,
        LUCIA,
        {
          storeId: FERRETERIA,
          fulfillment: 'pickup',
          items: [{ variantId: NEGRO, qty: 2 }],
        },
        'test-order-key-1',
      ),
    );
    expect(again.status).toBe('idempotent');
    const after = await asUser(LUCIA, (tx) => listMyOrders(tx, LUCIA));
    expect(after.length).toBe(before.length); // misma clave ⇒ no crea otro
  });

  it('rechaza una línea con variante inexistente en la tienda', async () => {
    const res = await asUser(LUCIA, (tx) =>
      createOrder(
        tx,
        LUCIA,
        {
          storeId: FERRETERIA,
          fulfillment: 'pickup',
          items: [
            { variantId: '66666666-6666-6666-6666-6666666666ff', qty: 1 },
          ],
        },
        'test-order-key-bad',
      ),
    );
    expect(res.status).toBe('invalid_line');
  });

  it('RLS: la tienda ve el pedido recibido; un tercero no lo ve', async () => {
    const forStore = await asUser(CARLOS, (tx) =>
      listStoreOrders(tx, FERRETERIA),
    );
    expect(forStore.length).toBeGreaterThanOrEqual(1);
    const target = forStore.find((o) => o.makerId === LUCIA);
    expect(target).toBeDefined();

    // Pedro (Punto Fijo, ni Maker ni miembro de la Ferretería) no lo ve.
    if (target) {
      const hidden = await asUser(PEDRO, (tx) => getOrder(tx, target.id));
      expect(hidden).toBeNull();
    }
    const pedroStore = await asUser(PEDRO, (tx) =>
      listStoreOrders(tx, FERRETERIA),
    );
    expect(pedroStore).toHaveLength(0);
  });
});
