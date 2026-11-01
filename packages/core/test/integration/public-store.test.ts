import { loadEnv } from '@3b/config';
import { type AppTransaction, createAppDb, withAppContext } from '@3b/db';
import { afterAll, describe, expect, it } from 'vitest';
import { getPublicStore } from '../../src/modules/catalog';

// UUIDs del seed determinista.
const LUCIA = '22222222-2222-2222-2222-222222222206'; // Maker, miembro de Coro
const FERRETERIA = '33333333-3333-3333-3333-333333333301'; // Coro, verificada (seed)
const PELUQUERIA = '33333333-3333-3333-3333-333333333302'; // con horario (seed)

const env = loadEnv();
const { db, client } = createAppDb(env.APP_DATABASE_URL);

function asUser<T>(userId: string, fn: (tx: AppTransaction) => Promise<T>) {
  return withAppContext(db, { userId }, fn);
}

afterAll(async () => {
  await client.end();
});

describe('catalog: ficha pública de tienda (storefront)', () => {
  it('un comprador ve la tienda con sus ítems publicados', async () => {
    const st = await asUser(LUCIA, (tx) => getPublicStore(tx, FERRETERIA));
    expect(st).not.toBeNull();
    expect(st?.verified).toBe(true); // KYC aprobada en el seed
    // Solo publicados: el taladro sí, el borrador destornilladores no.
    expect(st?.items.some((i) => i.title.includes('Taladro'))).toBe(true);
    expect(st?.items.some((i) => i.title.includes('destornilladores'))).toBe(
      false,
    );
    expect(st?.items.every((i) => i.publishedAt !== null)).toBe(true);
  });

  it('trae el horario (público) de la tienda', async () => {
    const st = await asUser(LUCIA, (tx) => getPublicStore(tx, PELUQUERIA));
    expect(st?.hours.length ?? 0).toBeGreaterThan(0);
    expect(st?.hours.every((h) => h.closesMin > h.opensMin)).toBe(true);
  });
});
