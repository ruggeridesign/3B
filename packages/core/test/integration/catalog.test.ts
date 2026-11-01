import { loadEnv } from '@3b/config';
import {
  type AppTransaction,
  and,
  createAppDb,
  eq,
  or,
  schema,
  withAppContext,
} from '@3b/db';
import { afterAll, describe, expect, it } from 'vitest';
import {
  createItem,
  deleteItem,
  listItemsByStore,
  updateItem,
} from '../../src/modules/catalog';

// UUIDs del seed determinista.
const CARLOS = '22222222-2222-2222-2222-222222222203'; // owner de Ferretería
const MARTA = '22222222-2222-2222-2222-222222222204'; // sales (no gestiona catálogo)
const LUCIA = '22222222-2222-2222-2222-222222222206'; // miembro de CORO, no de la tienda
const FERRETERIA = '33333333-3333-3333-3333-333333333301'; // tienda en CORO
const CORO = '11111111-1111-1111-1111-111111111101';

// Slugs propios del test (para no tocar los ítems del seed al limpiar).
const SLUG_A = 'test-martillo';
const SLUG_DRAFT = 'test-borrador';

const env = loadEnv();
const { db, client } = createAppDb(env.APP_DATABASE_URL);

function asUser<T>(userId: string, fn: (tx: AppTransaction) => Promise<T>) {
  return withAppContext(db, { userId }, fn);
}

afterAll(async () => {
  // Limpia SOLO los ítems creados por el test (deja intactos los del seed).
  await asUser(CARLOS, (tx) =>
    tx
      .delete(schema.items)
      .where(
        and(
          eq(schema.items.storeId, FERRETERIA),
          or(eq(schema.items.slug, SLUG_A), eq(schema.items.slug, SLUG_DRAFT)),
        ),
      ),
  );
  await client.end();
});

describe('catalog: ítems bajo RLS', () => {
  it('el owner crea un ítem y el trigger denormaliza community_id', async () => {
    const item = await asUser(CARLOS, (tx) =>
      createItem(tx, {
        storeId: FERRETERIA,
        kind: 'product',
        slug: SLUG_A,
        title: 'Martillo ACME',
        priceAmount: '12.50',
        currency: 'USD',
        priceMode: 'fixed',
        status: 'draft',
      }),
    );
    expect(item).toMatchObject({
      storeId: FERRETERIA,
      communityId: CORO, // lo fijó el trigger desde la tienda (D-05)
      slug: SLUG_A,
      status: 'draft',
      priceAmount: '12.50',
    });
    expect(item.publishedAt).toBeNull();
  });

  it('publicar fija published_at', async () => {
    const draft = await asUser(CARLOS, (tx) =>
      createItem(tx, {
        storeId: FERRETERIA,
        kind: 'product',
        slug: SLUG_DRAFT,
        title: 'Borrador a publicar',
        currency: 'USD',
        priceMode: 'fixed',
        status: 'draft',
      }),
    );
    expect(draft.publishedAt).toBeNull();

    const published = await asUser(CARLOS, (tx) =>
      updateItem(tx, {
        storeId: FERRETERIA,
        id: draft.id,
        status: 'published',
      }),
    );
    expect(published?.status).toBe('published');
    expect(published?.publishedAt).not.toBeNull();
  });

  it('un miembro sales NO puede crear ítems (RLS exige owner/admin/catalog)', async () => {
    await expect(
      asUser(MARTA, (tx) =>
        createItem(tx, {
          storeId: FERRETERIA,
          kind: 'product',
          slug: 'test-no-permitido',
          title: 'No permitido',
          currency: 'USD',
          priceMode: 'fixed',
          status: 'draft',
        }),
      ),
    ).rejects.toThrow();
  });

  it('un no-miembro de la tienda solo ve los ítems publicados', async () => {
    // Lucía es miembro de CORO pero no de la tienda. SLUG_A sigue en borrador.
    const seen = await asUser(LUCIA, (tx) => listItemsByStore(tx, FERRETERIA));
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((i) => i.status === 'published')).toBe(true);
    expect(seen.map((i) => i.slug)).not.toContain(SLUG_A);
  });

  it('el owner puede borrar un ítem propio del test', async () => {
    const all = await asUser(CARLOS, (tx) => listItemsByStore(tx, FERRETERIA));
    const target = all.find((i) => i.slug === SLUG_A);
    expect(target).toBeDefined();
    const ok = await asUser(CARLOS, (tx) =>
      deleteItem(tx, FERRETERIA, (target as { id: string }).id),
    );
    expect(ok).toBe(true);
  });

  it('los valores de atributo hacen round-trip (jsonb)', async () => {
    const item = await asUser(CARLOS, (tx) =>
      createItem(tx, {
        storeId: FERRETERIA,
        kind: 'product',
        slug: 'test-con-attrs',
        title: 'Con atributos',
        currency: 'USD',
        priceMode: 'fixed',
        status: 'draft',
        attributes: { marca: 'Bosch', garantia_meses: 12, inalambrico: true },
      }),
    );
    expect(item.attributes).toEqual({
      marca: 'Bosch',
      garantia_meses: 12,
      inalambrico: true,
    });
    await asUser(CARLOS, (tx) => deleteItem(tx, FERRETERIA, item.id));
  });
});
