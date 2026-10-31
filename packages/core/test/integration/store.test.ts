import { loadEnv } from '@3b/config';
import {
  type AppTransaction,
  and,
  createAppDb,
  eq,
  schema,
  withAppContext,
} from '@3b/db';
import { afterAll, describe, expect, it } from 'vitest';
import {
  addStoreMember,
  createStore,
  listMyStores,
  listStoreMembers,
  removeStoreMember,
  updateStoreMemberRole,
} from '../../src/modules/store';

// UUIDs del seed determinista.
const CARLOS = '22222222-2222-2222-2222-222222222203'; // owner de 2 tiendas
const MARTA = '22222222-2222-2222-2222-222222222204'; // staff (sales) de Ferretería
const LUCIA = '22222222-2222-2222-2222-222222222206'; // Maker a secas (Coro)

const CORO = '11111111-1111-1111-1111-111111111101'; // Lucía es miembro
const SANTA_ANA = '11111111-1111-1111-1111-111111111103'; // Lucía NO es miembro

const FERRETERIA = '33333333-3333-3333-3333-333333333301'; // tienda de Carlos (Coro)

const env = loadEnv();
const { db, client } = createAppDb(env.APP_DATABASE_URL);

afterAll(async () => {
  // Limpieza: borra la tienda creada por el test para no acoplar con otros.
  await withAppContext(db, { userId: LUCIA }, (tx) =>
    tx.delete(schema.stores).where(eq(schema.stores.slug, 'tienda-lucia')),
  );
  // Y la membresía de Lucía en Ferretería (si quedó colgada); la quita el owner.
  await withAppContext(db, { userId: CARLOS }, (tx) =>
    tx
      .delete(schema.storeMembers)
      .where(
        and(
          eq(schema.storeMembers.storeId, FERRETERIA),
          eq(schema.storeMembers.userId, LUCIA),
        ),
      ),
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

describe('store: equipo/roles bajo RLS', () => {
  it('Carlos (owner) ve el equipo de Ferretería con sus roles', async () => {
    const members = await asUser(CARLOS, (tx) =>
      listStoreMembers(tx, FERRETERIA),
    );
    const roleByUser = Object.fromEntries(
      members.map((m) => [m.userId, m.role]),
    );
    expect(roleByUser[CARLOS]).toBe('owner');
    expect(roleByUser[MARTA]).toBe('sales');
  });

  it('Carlos invita a Lucía, le cambia el rol y la quita', async () => {
    const added = await asUser(CARLOS, (tx) =>
      addStoreMember(tx, {
        storeId: FERRETERIA,
        userId: LUCIA,
        role: 'catalog',
      }),
    );
    expect(added).toMatchObject({ userId: LUCIA, role: 'catalog' });

    const updated = await asUser(CARLOS, (tx) =>
      updateStoreMemberRole(tx, {
        storeId: FERRETERIA,
        userId: LUCIA,
        role: 'sales',
      }),
    );
    expect(updated).toMatchObject({
      status: 'ok',
      member: { userId: LUCIA, role: 'sales' },
    });

    const removed = await asUser(CARLOS, (tx) =>
      removeStoreMember(tx, { storeId: FERRETERIA, userId: LUCIA }),
    );
    expect(removed).toEqual({ status: 'ok' });

    const after = await asUser(CARLOS, (tx) =>
      listStoreMembers(tx, FERRETERIA),
    );
    expect(after.map((m) => m.userId)).not.toContain(LUCIA);
  });

  it('al dueño no se lo degrada ni se lo quita (invariante)', async () => {
    const demote = await asUser(CARLOS, (tx) =>
      updateStoreMemberRole(tx, {
        storeId: FERRETERIA,
        userId: CARLOS,
        role: 'admin',
      }),
    );
    expect(demote).toEqual({ status: 'owner_protected' });

    const drop = await asUser(CARLOS, (tx) =>
      removeStoreMember(tx, { storeId: FERRETERIA, userId: CARLOS }),
    );
    expect(drop).toEqual({ status: 'owner_protected' });
  });

  it('Marta (sales) no puede invitar: la RLS sm_insert la bloquea', async () => {
    await expect(
      asUser(MARTA, (tx) =>
        addStoreMember(tx, {
          storeId: FERRETERIA,
          userId: LUCIA,
          role: 'sales',
        }),
      ),
    ).rejects.toThrow();
  });
});
