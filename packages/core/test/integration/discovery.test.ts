import { loadEnv } from '@3b/config';
import { type AppTransaction, createAppDb, withAppContext } from '@3b/db';
import { afterAll, describe, expect, it } from 'vitest';
import { searchItems } from '../../src/modules/catalog';

// UUIDs del seed determinista.
const CARLOS = '22222222-2222-2222-2222-222222222203'; // owner de Ferretería
const LUCIA = '22222222-2222-2222-2222-222222222206'; // Maker, miembro de Coro

const env = loadEnv();
const { db, client } = createAppDb(env.APP_DATABASE_URL);

function asUser<T>(userId: string, fn: (tx: AppTransaction) => Promise<T>) {
  return withAppContext(db, { userId }, fn);
}
const page = { limit: 20, offset: 0 };

afterAll(async () => {
  await client.end();
});

describe('catalog: descubrimiento (feed + búsqueda)', () => {
  it('un Maker encuentra ítems publicados de su comunidad por texto', async () => {
    const { items } = await asUser(LUCIA, (tx) =>
      searchItems(tx, { q: 'taladro', ...page }),
    );
    expect(items.some((i) => i.title.includes('Taladro'))).toBe(true);
    // Trae datos de la tienda para la ficha.
    const taladro = items.find((i) => i.title.includes('Taladro'));
    expect(taladro?.storeName).toBeTruthy();
  });

  it('la búsqueda ignora acentos (unaccent)', async () => {
    const { items } = await asUser(LUCIA, (tx) =>
      searchItems(tx, { q: 'taladró', ...page }),
    );
    expect(items.some((i) => i.title.includes('Taladro'))).toBe(true);
  });

  it('el filtro por tipo acota (servicios vs productos)', async () => {
    const { items } = await asUser(LUCIA, (tx) =>
      searchItems(tx, { kind: 'service', ...page }),
    );
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((i) => i.kind === 'service')).toBe(true);
    expect(items.some((i) => i.title.includes('Taladro'))).toBe(false);
  });

  it('nunca muestra borradores, ni siquiera al dueño', async () => {
    // El dueño ve su borrador en la gestión, pero NO en el descubrimiento.
    const { items } = await asUser(CARLOS, (tx) =>
      searchItems(tx, { q: 'destornilladores', ...page }),
    );
    expect(items.some((i) => i.title.includes('destornilladores'))).toBe(false);
  });

  it('el feed sin texto devuelve publicados por recencia', async () => {
    const { items } = await asUser(LUCIA, (tx) => searchItems(tx, { ...page }));
    expect(items.length).toBeGreaterThan(0);
    // Todos publicados (tienen published_at).
    expect(items.every((i) => i.publishedAt !== null)).toBe(true);
  });
});
