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
  createCategory,
  createItem,
  deleteItem,
  listCategories,
} from '../../src/modules/catalog';

// UUIDs del seed determinista.
const ADMIN = '22222222-2222-2222-2222-222222222201'; // admin de plataforma
const CARLOS = '22222222-2222-2222-2222-222222222203'; // owner de Ferretería (no admin)
const FERRETERIA = '33333333-3333-3333-3333-333333333301';
const CAT_TALADROS = '55555555-5555-5555-5555-555555555502'; // del seed

const SLUG_CAT = 'test-categoria';
const SLUG_ITEM = 'test-item-categorizado';

const env = loadEnv();
const { db, client } = createAppDb(env.APP_DATABASE_URL);

function asUser<T>(userId: string, fn: (tx: AppTransaction) => Promise<T>) {
  return withAppContext(db, { userId }, fn);
}

afterAll(async () => {
  await asUser(CARLOS, (tx) =>
    tx
      .delete(schema.items)
      .where(
        and(
          eq(schema.items.storeId, FERRETERIA),
          eq(schema.items.slug, SLUG_ITEM),
        ),
      ),
  );
  await asUser(ADMIN, (tx) =>
    tx.delete(schema.categories).where(eq(schema.categories.slug, SLUG_CAT)),
  );
  await client.end();
});

describe('catalog: categorías (taxonomía) bajo RLS', () => {
  it('cualquier sesión ve la taxonomía del seed', async () => {
    const cats = await asUser(CARLOS, (tx) => listCategories(tx));
    const slugs = cats.map((c) => c.slug);
    expect(slugs).toContain('herramientas');
    expect(slugs).toContain('taladros');
  });

  it('el admin de plataforma crea una categoría', async () => {
    const cat = await asUser(ADMIN, (tx) =>
      createCategory(tx, {
        name: 'Test categoría',
        slug: SLUG_CAT,
        kind: 'both',
      }),
    );
    expect(cat).toMatchObject({ slug: SLUG_CAT, kind: 'both', parentId: null });
  });

  it('un no-admin NO puede crear categorías (RLS)', async () => {
    await expect(
      asUser(CARLOS, (tx) =>
        createCategory(tx, {
          name: 'Prohibida',
          slug: 'test-prohibida',
          kind: 'product',
        }),
      ),
    ).rejects.toThrow();
  });

  it('un ítem se puede asignar a una categoría', async () => {
    const item = await asUser(CARLOS, (tx) =>
      createItem(tx, {
        storeId: FERRETERIA,
        kind: 'product',
        slug: SLUG_ITEM,
        title: 'Ítem categorizado',
        categoryId: CAT_TALADROS,
        currency: 'USD',
        priceMode: 'fixed',
        status: 'draft',
      }),
    );
    expect(item.categoryId).toBe(CAT_TALADROS);

    await asUser(CARLOS, (tx) => deleteItem(tx, FERRETERIA, item.id));
  });
});
