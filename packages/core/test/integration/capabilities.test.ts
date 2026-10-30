import { loadEnv } from '@3b/config';
import { createAppDb, withAppContext } from '@3b/db';
import { afterAll, describe, expect, it } from 'vitest';
import { readMe } from '../../src/modules/identity';

// UUIDs del seed determinista.
const ADMIN = '22222222-2222-2222-2222-222222222201';
const CARLOS = '22222222-2222-2222-2222-222222222203';
const PEDRO = '22222222-2222-2222-2222-222222222205';
const LUCIA = '22222222-2222-2222-2222-222222222206';

const env = loadEnv();
const { db, client } = createAppDb(env.APP_DATABASE_URL);

afterAll(async () => {
  await client.end();
});

describe('Resolución de capacidades (RBAC) sobre el seed', () => {
  it('Lucía: solo Maker, 1 comunidad (Coro), sin tiendas', async () => {
    const me = await withAppContext(db, { userId: LUCIA }, (tx) =>
      readMe(tx, LUCIA),
    );
    expect(me?.capabilities).toMatchObject({
      isMaker: true,
      isSeller: false,
      isMover: false,
      isPlatformAdmin: false,
    });
    expect(me?.communities.map((c) => c.slug)).toEqual(['coro']);
    expect(me?.stores).toHaveLength(0);
  });

  it('Carlos: Seller (dueño de tiendas)', async () => {
    const me = await withAppContext(db, { userId: CARLOS }, (tx) =>
      readMe(tx, CARLOS),
    );
    expect(me?.capabilities.isSeller).toBe(true);
    expect(me?.stores.length).toBeGreaterThanOrEqual(2);
  });

  it('Pedro: Mover (perfil aprobado)', async () => {
    const me = await withAppContext(db, { userId: PEDRO }, (tx) =>
      readMe(tx, PEDRO),
    );
    expect(me?.capabilities.isMover).toBe(true);
  });

  it('Admin: capacidad de plataforma', async () => {
    const me = await withAppContext(db, { userId: ADMIN }, (tx) =>
      readMe(tx, ADMIN),
    );
    expect(me?.capabilities.isPlatformAdmin).toBe(true);
  });
});
