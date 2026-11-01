import { loadEnv } from '@3b/config';
import { type AppTransaction, createAppDb, withAppContext } from '@3b/db';
import { afterAll, describe, expect, it } from 'vitest';
import { applyMovement, getLevel } from '../../src/modules/inventory';

// UUIDs del seed determinista.
const CARLOS = '22222222-2222-2222-2222-222222222203'; // owner de Ferretería
const MARTA = '22222222-2222-2222-2222-222222222204'; // sales (no gestiona catálogo)
const LUCIA = '22222222-2222-2222-2222-222222222206'; // no es miembro de la tienda
const NEGRO = '66666666-6666-6666-6666-666666666601'; // variante del taladro (stock=20 seed)

const env = loadEnv();
const { db, client } = createAppDb(env.APP_DATABASE_URL);

function asUser<T>(userId: string, fn: (tx: AppTransaction) => Promise<T>) {
  return withAppContext(db, { userId }, fn);
}

afterAll(async () => {
  await client.end();
});

describe('inventory: existencias y movimientos bajo RLS', () => {
  it('receipt suma, sale resta, y el libro proyecta el nivel', async () => {
    const before = await asUser(CARLOS, (tx) => getLevel(tx, NEGRO));
    const start = before?.onHand ?? 0;

    const r = await asUser(CARLOS, (tx) =>
      applyMovement(tx, NEGRO, CARLOS, {
        kind: 'receipt',
        qty: 5,
        channel: 'counter',
      }),
    );
    expect(r.status).toBe('ok');
    if (r.status === 'ok') expect(r.level.onHand).toBe(start + 5);

    const s = await asUser(CARLOS, (tx) =>
      applyMovement(tx, NEGRO, CARLOS, {
        kind: 'sale',
        qty: -3,
        channel: 'counter',
      }),
    );
    expect(s.status).toBe('ok');
    if (s.status === 'ok') {
      expect(s.level.onHand).toBe(start + 2);
      expect(s.level.available).toBe(start + 2); // reserved = 0 por ahora
    }
  });

  it('no sobrevende: un sale mayor al físico devuelve insufficient', async () => {
    const res = await asUser(CARLOS, (tx) =>
      applyMovement(tx, NEGRO, CARLOS, {
        kind: 'sale',
        qty: -100000,
        channel: 'counter',
      }),
    );
    expect(res.status).toBe('insufficient');
  });

  it('es idempotente por idempotencyKey (no re-aplica)', async () => {
    const key = `test-idem-${Date.now()}`;
    const before = await asUser(CARLOS, (tx) => getLevel(tx, NEGRO));
    const start = before?.onHand ?? 0;

    const first = await asUser(CARLOS, (tx) =>
      applyMovement(tx, NEGRO, CARLOS, {
        kind: 'adjustment',
        qty: -2,
        channel: 'counter',
        idempotencyKey: key,
      }),
    );
    expect(first.status).toBe('ok');

    const again = await asUser(CARLOS, (tx) =>
      applyMovement(tx, NEGRO, CARLOS, {
        kind: 'adjustment',
        qty: -2,
        channel: 'counter',
        idempotencyKey: key,
      }),
    );
    expect(again.status).toBe('idempotent');

    const after = await asUser(CARLOS, (tx) => getLevel(tx, NEGRO));
    expect(after?.onHand).toBe(start - 2); // se aplicó UNA sola vez
  });

  it('sales NO puede mover stock (RLS); un no-miembro no ve el nivel', async () => {
    await expect(
      asUser(MARTA, (tx) =>
        applyMovement(tx, NEGRO, MARTA, {
          kind: 'receipt',
          qty: 1,
          channel: 'counter',
        }),
      ),
    ).rejects.toThrow();

    const hers = await asUser(LUCIA, (tx) => getLevel(tx, NEGRO));
    expect(hers).toBeNull();
  });
});
