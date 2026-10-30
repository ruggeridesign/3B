import { loadEnv } from '@3b/config';
import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { createAppDb, withAppContext } from '../../src/context';
import { communities } from '../../src/schema/community';
import { users } from '../../src/schema/identity';
import { storeMembers, stores } from '../../src/schema/store';

// UUIDs del seed determinista.
const ADMIN = '22222222-2222-2222-2222-222222222201'; // admin de plataforma
const CARLOS = '22222222-2222-2222-2222-222222222203'; // Seller (owner)
const LUCIA = '22222222-2222-2222-2222-222222222206'; // Maker (member de Coro)

const env = loadEnv();
// Conexión con el rol `app` (mínimo privilegio, sujeto a RLS).
const { db, client } = createAppDb(env.APP_DATABASE_URL);

afterAll(async () => {
  await client.end();
});

describe('Aislamiento RLS por comunidad y por tienda (rol app)', () => {
  it('Lucía (member de Coro) NO ve la comunidad privada ajena', async () => {
    const rows = await withAppContext(db, { userId: LUCIA }, (tx) =>
      tx.select({ slug: communities.slug }).from(communities),
    );
    const slugs = rows.map((r) => r.slug);
    expect(slugs).toContain('coro');
    expect(slugs).not.toContain('villa-del-sol');
  });

  it('El admin de plataforma SÍ ve la comunidad privada', async () => {
    const rows = await withAppContext(db, { userId: ADMIN }, (tx) =>
      tx.select({ slug: communities.slug }).from(communities),
    );
    expect(rows.map((r) => r.slug)).toContain('villa-del-sol');
  });

  it('Lucía (no es Seller) NO ve miembros de ninguna tienda', async () => {
    const rows = await withAppContext(db, { userId: LUCIA }, (tx) =>
      tx.select().from(storeMembers),
    );
    expect(rows).toHaveLength(0);
  });

  it('Carlos (owner) ve los miembros de sus tiendas', async () => {
    const rows = await withAppContext(db, { userId: CARLOS }, (tx) =>
      tx.select().from(storeMembers),
    );
    expect(rows.length).toBeGreaterThanOrEqual(3);
  });

  it('Lucía (Coro) NO ve a Pedro (solo Punto Fijo): aislamiento de usuarios', async () => {
    const rows = await withAppContext(db, { userId: LUCIA }, (tx) =>
      tx.select({ email: users.email }).from(users),
    );
    const emails = rows.map((r) => r.email);
    expect(emails).toContain('lucia@3b.test'); // se ve a sí misma
    expect(emails).toContain('carlos@3b.test'); // comparte Coro
    expect(emails).not.toContain('pedro@3b.test'); // no comparte comunidad
  });

  it('Lucía NO puede modificar una tienda ajena (RLS bloquea el UPDATE)', async () => {
    const result = await withAppContext(db, { userId: LUCIA }, (tx) =>
      tx
        .update(stores)
        .set({ name: 'hackeada' })
        .where(eq(stores.slug, 'ferreteria-central'))
        .returning({ id: stores.id }),
    );
    expect(result).toHaveLength(0); // 0 filas afectadas
  });
});
