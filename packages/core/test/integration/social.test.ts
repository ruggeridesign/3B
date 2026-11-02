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
  createStoreReview,
  storeReviewSummary,
} from '../../src/modules/social';

// UUIDs del seed determinista.
const CARLOS = '22222222-2222-2222-2222-222222222203'; // owner de Ferretería (Coro)
const PEDRO = '22222222-2222-2222-2222-222222222205'; // no es el comprador
const LUCIA = '22222222-2222-2222-2222-222222222206'; // Maker (Coro)
const CORO = '11111111-1111-1111-1111-111111111101';
const FERRETERIA = '33333333-3333-3333-3333-333333333301';

const SLUG = 'test-social-review';

const env = loadEnv();
const { db, client } = createAppDb(env.APP_DATABASE_URL);

// Variante DEDICADA a este archivo (creada en beforeAll): social reserva y
// **retiene** stock al completar (el `consume` del retiro es no-op hasta M6), así
// que no puede compartir variante con orders/inventory (sus aserciones de
// `reserved`/`available` se romperían). Con su propia variante no hay carrera.
let VARIANT = '';

function asUser<T>(userId: string, fn: (tx: AppTransaction) => Promise<T>) {
  return withAppContext(db, { userId }, fn);
}

beforeAll(async () => {
  const item = await asUser(CARLOS, (tx) =>
    createItem(tx, {
      storeId: FERRETERIA,
      kind: 'product',
      slug: SLUG,
      title: 'Ítem de prueba (reseñas)',
      priceAmount: '10.00',
      currency: 'USD',
      priceMode: 'fixed',
      status: 'draft',
    }),
  );
  const variant = await asUser(CARLOS, (tx) =>
    createVariant(tx, item.id, { sku: 'SOCIAL-REV-1', axisValues: {} }),
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

describe('social (M5d.2): reseñas verificadas al completado bajo RLS', () => {
  /** Crea un pedido de Lucía con la variante dedicada en estado `realizado`. */
  async function makeOrder(key: string): Promise<string> {
    const res = await asUser(LUCIA, (tx) =>
      createOrder(
        tx,
        LUCIA,
        {
          storeId: FERRETERIA,
          fulfillment: 'pickup',
          items: [{ variantId: VARIANT, qty: 1 }],
        },
        key,
      ),
    );
    if (res.status !== 'ok')
      throw new Error(`setup createOrder: ${res.status}`);
    return res.order.id;
  }

  /** Lleva el pedido a `completado` por el camino de retiro en tienda. */
  async function complete(key: string): Promise<string> {
    const orderId = await makeOrder(key);
    const steps: Array<
      [string, 'aceptado' | 'listo' | 'retirado' | 'completado']
    > = [
      [CARLOS, 'aceptado'], // reserva stock
      [CARLOS, 'listo'], // pago contra entrega
      [CARLOS, 'retirado'], // entrega en el mostrador
      [LUCIA, 'completado'], // el comprador confirma
    ];
    for (const [actor, to] of steps) {
      const r = await asUser(actor, (tx) =>
        transitionOrder(tx, orderId, actor, to, null),
      );
      if (r.status !== 'ok') throw new Error(`setup ${to}: ${r.status}`);
    }
    return orderId;
  }

  it('solo se reseña al completado', async () => {
    const orderId = await makeOrder('m5d2-state-key'); // queda en realizado
    const early = await asUser(LUCIA, (tx) =>
      createStoreReview(tx, orderId, LUCIA, { rating: 5 }),
    );
    expect(early.status).toBe('not_completed');
  });

  it('el comprador reseña un pedido completado (salida de M5d)', async () => {
    const orderId = await complete('m5d2-ok-key');
    const res = await asUser(LUCIA, (tx) =>
      createStoreReview(tx, orderId, LUCIA, {
        rating: 5,
        body: 'Todo perfecto',
      }),
    );
    expect(res.status).toBe('ok');
    if (res.status === 'ok') {
      expect(res.review.rating).toBe(5);
      expect(res.review.subjectType).toBe('store');
      expect(res.review.subjectId).toBe(FERRETERIA);
    }

    const summary = await asUser(LUCIA, (tx) =>
      storeReviewSummary(tx, FERRETERIA),
    );
    expect(summary.reviews.some((r) => r.orderId === orderId)).toBe(true);
    expect(summary.average).not.toBeNull();
  });

  it('no se reseña dos veces el mismo pedido (D-04)', async () => {
    const orderId = await complete('m5d2-dup-key');
    const first = await asUser(LUCIA, (tx) =>
      createStoreReview(tx, orderId, LUCIA, { rating: 4 }),
    );
    expect(first.status).toBe('ok');
    const again = await asUser(LUCIA, (tx) =>
      createStoreReview(tx, orderId, LUCIA, { rating: 1 }),
    );
    expect(again.status).toBe('duplicate');
  });

  it('solo el comprador reseña (la tienda no)', async () => {
    const orderId = await complete('m5d2-forbidden-key');
    const res = await asUser(CARLOS, (tx) =>
      createStoreReview(tx, orderId, CARLOS, { rating: 5 }),
    );
    expect(res.status).toBe('forbidden');
  });

  it('RLS: un tercero no puede insertar una reseña de un pedido ajeno', async () => {
    const orderId = await complete('m5d2-rls-key'); // pedido de Lucía
    const mine = await asUser(LUCIA, (tx) =>
      createStoreReview(tx, orderId, LUCIA, { rating: 5 }),
    );
    expect(mine.status).toBe('ok');

    // Pedro (no es el comprador) intenta insertar directamente, saltándose el
    // servicio: la RLS (WITH CHECK) es el candado final y lo rechaza.
    await expect(
      asUser(PEDRO, (tx) =>
        tx.insert(schema.reviews).values({
          orderId,
          authorId: PEDRO,
          authorName: 'Pedro',
          subjectType: 'store',
          subjectId: FERRETERIA,
          communityId: CORO,
          rating: 5,
        }),
      ),
    ).rejects.toThrow();
  });
});
