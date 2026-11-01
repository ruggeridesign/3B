import { loadEnv } from '@3b/config';
import { type AppTransaction, createAppDb, withAppContext } from '@3b/db';
import { afterAll, describe, expect, it } from 'vitest';
import { getFacets, searchItems } from '../../src/modules/catalog';

// UUIDs del seed determinista.
const LUCIA = '22222222-2222-2222-2222-222222222206'; // Maker, miembro de Coro

const env = loadEnv();
const { db, client } = createAppDb(env.APP_DATABASE_URL);
const page = { limit: 20, offset: 0 };

function asUser<T>(userId: string, fn: (tx: AppTransaction) => Promise<T>) {
  return withAppContext(db, { userId }, fn);
}

afterAll(async () => {
  await client.end();
});

describe('catalog: facetas y filtros por atributo', () => {
  it('las facetas exponen valores de ítems publicados (no borradores)', async () => {
    const { facets } = await asUser(LUCIA, (tx) => getFacets(tx, {}));
    const marca = facets.find((f) => f.key === 'marca');
    expect(marca).toBeDefined();
    // Bosch (taladro publicado) presente; Stanley (destornilladores borrador) no.
    expect(marca?.values.some((v) => v.value === 'Bosch')).toBe(true);
    expect(marca?.values.some((v) => v.value === 'Stanley')).toBe(false);
  });

  it('filtra por atributo (match exacto)', async () => {
    const hit = await asUser(LUCIA, (tx) =>
      searchItems(tx, { attrs: [{ key: 'marca', value: 'Bosch' }], ...page }),
    );
    expect(hit.items.some((i) => i.title.includes('Taladro'))).toBe(true);

    const miss = await asUser(LUCIA, (tx) =>
      searchItems(tx, { attrs: [{ key: 'marca', value: 'Acme' }], ...page }),
    );
    expect(miss.items).toHaveLength(0);
  });

  it('múltiples filtros son AND', async () => {
    const both = await asUser(LUCIA, (tx) =>
      searchItems(tx, {
        attrs: [
          { key: 'marca', value: 'Bosch' },
          { key: 'voltaje', value: '650' },
        ],
        ...page,
      }),
    );
    expect(both.items.some((i) => i.title.includes('Taladro'))).toBe(true);

    const contradictorio = await asUser(LUCIA, (tx) =>
      searchItems(tx, {
        attrs: [
          { key: 'marca', value: 'Bosch' },
          { key: 'voltaje', value: '220' },
        ],
        ...page,
      }),
    );
    expect(contradictorio.items).toHaveLength(0);
  });
});
