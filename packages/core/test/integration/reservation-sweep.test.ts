import { loadEnv } from '@3b/config';
import {
  type AppTransaction,
  createAppDb,
  eq,
  schema,
  withAppContext,
} from '@3b/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createItem, createVariant } from '../../src/modules/catalog';
import {
  applyMovement,
  sweepExpiredReservations,
} from '../../src/modules/inventory';

// UUIDs del seed determinista.
const CARLOS = '22222222-2222-2222-2222-222222222203'; // owner de Ferretería
const FERRETERIA = '33333333-3333-3333-3333-333333333301';
const O_DEMO = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01'; // pedido del seed (FK válida)

const SLUG = 'test-sweep-item';

const env = loadEnv();
// `app` (RLS) para el setup; `owner` (bypassa RLS) para el job de sistema (sweep).
const app = createAppDb(env.APP_DATABASE_URL);
const owner = createAppDb(env.DATABASE_URL);

function asUser<T>(userId: string, fn: (tx: AppTransaction) => Promise<T>) {
  return withAppContext(app.db, { userId }, fn);
}

// Variante DEDICADA (beforeAll): el sweep es global, pero solo mis reservas
// vencen (las de otros archivos nacen con +30 min), así que no hay contención.
let VARIANT = '';

async function reservedOf(variantId: string): Promise<number> {
  const [lvl] = await owner.db
    .select({ reserved: schema.stockLevels.reserved })
    .from(schema.stockLevels)
    .where(eq(schema.stockLevels.variantId, variantId))
    .limit(1);
  return lvl?.reserved ?? 0;
}

beforeAll(async () => {
  const item = await asUser(CARLOS, (tx) =>
    createItem(tx, {
      storeId: FERRETERIA,
      kind: 'product',
      slug: SLUG,
      title: 'Ítem de prueba (sweep)',
      priceAmount: '1.00',
      currency: 'USD',
      priceMode: 'fixed',
      status: 'draft',
    }),
  );
  const variant = await asUser(CARLOS, (tx) =>
    createVariant(tx, item.id, { sku: 'SWEEP-1', axisValues: {} }),
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

describe('reservation sweep (I-5): vencimiento de reservas por el worker', () => {
  it('libera una reserva vencida y emite stock.changed en el outbox', async () => {
    const past = new Date(Date.now() - 60_000);
    await owner.db.insert(schema.reservations).values({
      orderId: O_DEMO,
      variantId: VARIANT,
      qty: 2,
      status: 'active',
      expiresAt: past,
    });
    expect(await reservedOf(VARIANT)).toBe(2); // el trigger proyectó la reserva

    const res = await sweepExpiredReservations(owner.db);
    expect(res.released).toBeGreaterThanOrEqual(1);
    expect(res.variants).toContain(VARIANT);
    expect(await reservedOf(VARIANT)).toBe(0); // reserva devuelta

    const events = await owner.db
      .select()
      .from(schema.outbox)
      .where(eq(schema.outbox.topic, 'stock.changed'));
    expect(
      events.some(
        (e) => (e.payload as { variantId?: string }).variantId === VARIANT,
      ),
    ).toBe(true);
  });

  it('no toca una reserva con expires_at futuro (control)', async () => {
    const future = new Date(Date.now() + 3_600_000);
    await owner.db.insert(schema.reservations).values({
      orderId: O_DEMO,
      variantId: VARIANT,
      qty: 1,
      status: 'active',
      expiresAt: future,
    });
    expect(await reservedOf(VARIANT)).toBe(1);

    await sweepExpiredReservations(owner.db);
    expect(await reservedOf(VARIANT)).toBe(1); // sigue activa
  });
});
