import { loadEnv } from '@3b/config';
import { type AppTransaction, createAppDb, withAppContext } from '@3b/db';
import { afterAll, describe, expect, it } from 'vitest';
import { getPublicItem } from '../../src/modules/catalog';

// UUIDs del seed determinista.
const LUCIA = '22222222-2222-2222-2222-222222222206'; // Maker, miembro de Coro
const TALADRO = '44444444-4444-4444-4444-444444444401'; // producto publicado (Coro)
const DESTORNILLADORES = '44444444-4444-4444-4444-444444444402'; // borrador
const CORTE = '44444444-4444-4444-4444-444444444403'; // servicio publicado
const NEGRO = '66666666-6666-6666-6666-666666666601'; // variante (stock seed = 20)

const env = loadEnv();
const { db, client } = createAppDb(env.APP_DATABASE_URL);
const url = (key: string) => `file:///${key}`;

function asUser<T>(userId: string, fn: (tx: AppTransaction) => Promise<T>) {
  return withAppContext(db, { userId }, fn);
}

afterAll(async () => {
  await client.end();
});

describe('catalog: ficha pública de ítem', () => {
  it('un comprador ve un producto publicado con tienda, variantes y stock', async () => {
    const it = await asUser(LUCIA, (tx) => getPublicItem(tx, TALADRO, url));
    expect(it).not.toBeNull();
    expect(it?.storeName).toBeTruthy();
    expect(it?.kind).toBe('product');
    // Variantes con disponibilidad proyectada desde inventario.
    const negro = it?.variants.find((v) => v.id === NEGRO);
    expect(negro?.available).toBe(20);
    expect(Array.isArray(it?.images)).toBe(true);
    expect(it?.serviceDetail).toBeNull();
  });

  it('un servicio publicado trae su detalle de servicio', async () => {
    const it = await asUser(LUCIA, (tx) => getPublicItem(tx, CORTE, url));
    expect(it?.kind).toBe('service');
    expect(it?.serviceDetail?.modality).toBe('in_store');
    expect(it?.serviceDetail?.durationMin).toBe(45);
  });

  it('un borrador no es visible para el comprador (null)', async () => {
    const it = await asUser(LUCIA, (tx) =>
      getPublicItem(tx, DESTORNILLADORES, url),
    );
    expect(it).toBeNull();
  });
});
