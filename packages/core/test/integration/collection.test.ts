import { loadEnv } from '@3b/config';
import {
  type AppTransaction,
  createAppDb,
  eq,
  schema,
  withAppContext,
} from '@3b/db';
import { afterAll, describe, expect, it } from 'vitest';
import {
  addCollectionItem,
  createCollection,
  deleteCollection,
  listCollections,
  removeCollectionItem,
} from '../../src/modules/catalog';

// UUIDs del seed determinista.
const CARLOS = '22222222-2222-2222-2222-222222222203'; // owner de Ferretería
const MARTA = '22222222-2222-2222-2222-222222222204'; // sales (no gestiona catálogo)
const LUCIA = '22222222-2222-2222-2222-222222222206'; // miembro de CORO, no de la tienda
const FERRETERIA = '33333333-3333-3333-3333-333333333301';
const TALADRO = '44444444-4444-4444-4444-444444444401'; // publicado
const DESTORNILLADORES = '44444444-4444-4444-4444-444444444402'; // borrador

const TITLE = 'Test colección vitrina';

const env = loadEnv();
const { db, client } = createAppDb(env.APP_DATABASE_URL);

function asUser<T>(userId: string, fn: (tx: AppTransaction) => Promise<T>) {
  return withAppContext(db, { userId }, fn);
}

afterAll(async () => {
  await asUser(CARLOS, (tx) =>
    tx.delete(schema.collections).where(eq(schema.collections.title, TITLE)),
  );
  await client.end();
});

describe('catalog: colecciones bajo RLS', () => {
  it('owner crea una colección, agrega ítems y los lista ordenados', async () => {
    const col = await asUser(CARLOS, (tx) =>
      createCollection(tx, { storeId: FERRETERIA, title: TITLE, position: 5 }),
    );
    expect(col).toMatchObject({ title: TITLE, position: 5, items: [] });

    await asUser(CARLOS, (tx) =>
      addCollectionItem(tx, col.id, { itemId: TALADRO, position: 1 }),
    );
    await asUser(CARLOS, (tx) =>
      addCollectionItem(tx, col.id, { itemId: DESTORNILLADORES, position: 0 }),
    );

    const mine = await asUser(CARLOS, (tx) => listCollections(tx, FERRETERIA));
    const theOne = mine.find((c) => c.id === col.id);
    // Ordenados por posición: destornilladores (0) antes que taladro (1).
    expect(theOne?.items.map((r) => r.itemId)).toEqual([
      DESTORNILLADORES,
      TALADRO,
    ]);
  });

  it('un par de comunidad ve la colección pero solo sus ítems publicados', async () => {
    const hers = await asUser(LUCIA, (tx) => listCollections(tx, FERRETERIA));
    const theOne = hers.find((c) => c.title === TITLE);
    // Ve la colección (pública a la comunidad) pero el borrador queda oculto por
    // la RLS: solo aparece el taladro (publicado).
    expect(theOne).toBeDefined();
    expect(theOne?.items.map((r) => r.itemId)).toEqual([TALADRO]);
  });

  it('sales NO puede crear ni agregar (RLS); owner quita y borra', async () => {
    await expect(
      asUser(MARTA, (tx) =>
        createCollection(tx, { storeId: FERRETERIA, title: 'Nope' }),
      ),
    ).rejects.toThrow();

    const [col] = (
      await asUser(CARLOS, (tx) => listCollections(tx, FERRETERIA))
    ).filter((c) => c.title === TITLE);

    await expect(
      asUser(MARTA, (tx) => addCollectionItem(tx, col.id, { itemId: TALADRO })),
    ).rejects.toThrow();

    const removed = await asUser(CARLOS, (tx) =>
      removeCollectionItem(tx, col.id, TALADRO),
    );
    expect(removed).toBe(true);

    const ok = await asUser(CARLOS, (tx) =>
      deleteCollection(tx, FERRETERIA, col.id),
    );
    expect(ok).toBe(true);
  });
});
