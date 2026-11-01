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
  createItem,
  createVariant,
  deleteVariant,
  listVariants,
  updateVariant,
} from '../../src/modules/catalog';

// UUIDs del seed determinista.
const CARLOS = '22222222-2222-2222-2222-222222222203'; // owner de Ferretería
const MARTA = '22222222-2222-2222-2222-222222222204'; // sales (no gestiona catálogo)
const LUCIA = '22222222-2222-2222-2222-222222222206'; // no es miembro de la tienda
const FERRETERIA = '33333333-3333-3333-3333-333333333301';
const TALADRO = '44444444-4444-4444-4444-444444444401'; // ítem del seed con variantes

const SLUG_ITEM = 'test-item-variantes';

const env = loadEnv();
const { db, client } = createAppDb(env.APP_DATABASE_URL);

function asUser<T>(userId: string, fn: (tx: AppTransaction) => Promise<T>) {
  return withAppContext(db, { userId }, fn);
}

afterAll(async () => {
  await asUser(CARLOS, (tx) =>
    tx.delete(schema.items).where(eq(schema.items.slug, SLUG_ITEM)),
  );
  await client.end();
});

describe('catalog: variantes de ítem bajo RLS', () => {
  it('el owner ve las variantes del seed; un no-miembro no las ve', async () => {
    const mine = await asUser(CARLOS, (tx) => listVariants(tx, TALADRO));
    expect(mine.map((v) => v.sku).sort()).toEqual([
      'TAL-650-AZUL',
      'TAL-650-NEGRO',
    ]);

    // El taladro está publicado → Lucía (miembro de CORO) ve el ítem y sus
    // variantes. Para probar el corte por RLS usamos un ítem en BORRADOR.
    const draft = await asUser(CARLOS, (tx) =>
      createItem(tx, {
        storeId: FERRETERIA,
        kind: 'product',
        slug: SLUG_ITEM,
        title: 'Con variantes (borrador)',
        currency: 'USD',
        priceMode: 'fixed',
        status: 'draft',
      }),
    );
    await asUser(CARLOS, (tx) =>
      createVariant(tx, draft.id, { sku: 'DRAFT-1', axisValues: {} }),
    );

    // Lucía no ve el ítem borrador (no es miembro) → tampoco su variante.
    const hers = await asUser(LUCIA, (tx) => listVariants(tx, draft.id));
    expect(hers).toHaveLength(0);
  });

  it('owner crea/edita/borra variantes; sales NO puede crear (RLS)', async () => {
    const created = await asUser(CARLOS, (tx) =>
      createVariant(tx, TALADRO, {
        sku: 'TAL-650-ROJO',
        axisValues: { color: 'rojo' },
        priceAmount: '52.00',
      }),
    );
    expect(created).toMatchObject({
      itemId: TALADRO,
      sku: 'TAL-650-ROJO',
      priceAmount: '52.00',
    });

    const updated = await asUser(CARLOS, (tx) =>
      updateVariant(tx, TALADRO, created.id, { trackStock: true }),
    );
    expect(updated?.trackStock).toBe(true);

    await expect(
      asUser(MARTA, (tx) =>
        createVariant(tx, TALADRO, { sku: 'TAL-NOPE', axisValues: {} }),
      ),
    ).rejects.toThrow();

    const ok = await asUser(CARLOS, (tx) =>
      deleteVariant(tx, TALADRO, created.id),
    );
    expect(ok).toBe(true);
  });
});
