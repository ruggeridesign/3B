import { loadEnv } from '@3b/config';
import {
  type AppTransaction,
  createAppDb,
  eq,
  schema,
  withAppContext,
} from '@3b/db';
import { afterAll, describe, expect, it } from 'vitest';
import { createStore, listMyStores } from '../../src/modules/store';

// UUIDs del seed determinista.
const CARLOS = '22222222-2222-2222-2222-222222222203'; // owner de 2 tiendas
const LUCIA = '22222222-2222-2222-2222-222222222206'; // Maker a secas (Coro)

const CORO = '11111111-1111-1111-1111-111111111101'; // Lucía es miembro
const SANTA_ANA = '11111111-1111-1111-1111-111111111103'; // Lucía NO es miembro

const env = loadEnv();
const { db, client } = createAppDb(env.APP_DATABASE_URL);

afterAll(async () => {
  // Limpieza: borra la tienda creada por el test para no acoplar con otros.
  await withAppContext(db, { userId: LUCIA }, (tx) =>
    tx.delete(schema.stores).where(eq(schema.stores.slug, 'tienda-lucia')),
  );
  await client.end();
});

function asUser<T>(userId: string, fn: (tx: AppTransaction) => Promise<T>) {
  return withAppContext(db, { userId }, fn);
}

describe('store: alta de tienda y "mis tiendas" bajo RLS', () => {
  it('Carlos ve sus 2 tiendas del seed', async () => {
    const stores = await asUser(CARLOS, (tx) => listMyStores(tx, CARLOS));
    expect(stores.map((s) => s.slug).sort()).toEqual([
      'ferreteria-central',
      'peluqueria-bella',
    ]);
  });

  it('Lucía abre una tienda en su comunidad y queda como owner (trigger)', async () => {
    const before = await asUser(LUCIA, (tx) => listMyStores(tx, LUCIA));
    expect(before).toHaveLength(0);

    const store = await asUser(LUCIA, (tx) =>
      createStore(tx, {
        ownerId: LUCIA,
        communityId: CORO,
        kind: 'products',
        slug: 'tienda-lucia',
        name: 'Tienda de Lucía',
      }),
    );
    expect(store).toMatchObject({
      ownerId: LUCIA,
      communityId: CORO,
      slug: 'tienda-lucia',
      status: 'active',
    });

    // El trigger creó la membresía owner → aparece en "mis tiendas".
    const after = await asUser(LUCIA, (tx) => listMyStores(tx, LUCIA));
    expect(after.map((s) => s.slug)).toContain('tienda-lucia');
  });

  it('Lucía NO puede abrir una tienda en una comunidad ajena (RLS)', async () => {
    await expect(
      asUser(LUCIA, (tx) =>
        createStore(tx, {
          ownerId: LUCIA,
          communityId: SANTA_ANA,
          kind: 'products',
          slug: 'tienda-ajena',
          name: 'Ajena',
        }),
      ),
    ).rejects.toThrow();
  });
});
