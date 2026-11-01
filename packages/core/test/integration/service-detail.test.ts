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
  deleteServiceDetail,
  getServiceDetail,
  upsertServiceDetail,
} from '../../src/modules/catalog';

// UUIDs del seed determinista.
const CARLOS = '22222222-2222-2222-2222-222222222203'; // owner de Ferretería
const MARTA = '22222222-2222-2222-2222-222222222204'; // sales (no gestiona catálogo)
const LUCIA = '22222222-2222-2222-2222-222222222206'; // no es miembro de la tienda
const FERRETERIA = '33333333-3333-3333-3333-333333333301';

const SLUG_SERVICE = 'test-servicio-detalle';
const SLUG_SERVICE_DRAFT = 'test-servicio-detalle-draft';

const env = loadEnv();
const { db, client } = createAppDb(env.APP_DATABASE_URL);

function asUser<T>(userId: string, fn: (tx: AppTransaction) => Promise<T>) {
  return withAppContext(db, { userId }, fn);
}

afterAll(async () => {
  await asUser(CARLOS, (tx) =>
    tx
      .delete(schema.items)
      .where(eq(schema.items.slug, SLUG_SERVICE))
      .then(() =>
        tx
          .delete(schema.items)
          .where(eq(schema.items.slug, SLUG_SERVICE_DRAFT)),
      ),
  );
  await client.end();
});

describe('catalog: detalle de servicio bajo RLS', () => {
  it('owner hace upsert (crear→reemplazar), lee; sales NO puede (RLS)', async () => {
    const item = await asUser(CARLOS, (tx) =>
      createItem(tx, {
        storeId: FERRETERIA,
        kind: 'service',
        slug: SLUG_SERVICE,
        title: 'Servicio con detalle',
        currency: 'USD',
        priceMode: 'from',
        status: 'published',
      }),
    );

    // Crear.
    const created = await asUser(CARLOS, (tx) =>
      upsertServiceDetail(tx, item.id, {
        durationMin: 30,
        modality: 'on_site',
        coverageKm: 5,
        notes: 'primera versión',
      }),
    );
    expect(created).toMatchObject({
      itemId: item.id,
      durationMin: 30,
      modality: 'on_site',
      coverageKm: 5,
    });

    // Segundo upsert = reemplaza (coverageKm ausente → null).
    const replaced = await asUser(CARLOS, (tx) =>
      upsertServiceDetail(tx, item.id, { durationMin: 60, modality: 'remote' }),
    );
    expect(replaced).toMatchObject({
      durationMin: 60,
      modality: 'remote',
      coverageKm: null,
      notes: null,
    });

    const read = await asUser(CARLOS, (tx) => getServiceDetail(tx, item.id));
    expect(read?.modality).toBe('remote');

    // Marta (sales) no gestiona el catálogo → la RLS bloquea el upsert.
    await expect(
      asUser(MARTA, (tx) =>
        upsertServiceDetail(tx, item.id, { modality: 'in_store' }),
      ),
    ).rejects.toThrow();
  });

  it('un no-miembro no ve el detalle de un ítem en borrador', async () => {
    const draft = await asUser(CARLOS, (tx) =>
      createItem(tx, {
        storeId: FERRETERIA,
        kind: 'service',
        slug: SLUG_SERVICE_DRAFT,
        title: 'Servicio borrador',
        currency: 'USD',
        priceMode: 'from',
        status: 'draft',
      }),
    );
    await asUser(CARLOS, (tx) =>
      upsertServiceDetail(tx, draft.id, { modality: 'in_store' }),
    );

    // Lucía no es miembro y el ítem está en borrador → no ve el detalle.
    const hers = await asUser(LUCIA, (tx) => getServiceDetail(tx, draft.id));
    expect(hers).toBeNull();

    // El owner sí puede borrarlo.
    const ok = await asUser(CARLOS, (tx) => deleteServiceDetail(tx, draft.id));
    expect(ok).toBe(true);
  });
});
