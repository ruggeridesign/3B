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
  createPendingMedia,
  deleteMediaRecord,
  listMediaByOwner,
  markMediaReady,
} from '../../src/modules/media';

// UUIDs del seed determinista.
const CARLOS = '22222222-2222-2222-2222-222222222203';
const LUCIA = '22222222-2222-2222-2222-222222222206';
const FERRETERIA = '33333333-3333-3333-3333-333333333301';

const env = loadEnv();
const { db, client } = createAppDb(env.APP_DATABASE_URL);

function asUser<T>(userId: string, fn: (tx: AppTransaction) => Promise<T>) {
  return withAppContext(db, { userId }, fn);
}

afterAll(async () => {
  await asUser(CARLOS, (tx) =>
    tx.delete(schema.mediaFiles).where(eq(schema.mediaFiles.createdBy, CARLOS)),
  );
  await client.end();
});

describe('media: subida en dos fases y RLS por created_by', () => {
  it('crea una media pending con key generada y luego la marca ready', async () => {
    const created = await asUser(CARLOS, (tx) =>
      createPendingMedia(tx, {
        ownerType: 'store',
        ownerId: FERRETERIA,
        mime: 'image/png',
      }),
    );
    expect(created).toMatchObject({
      ownerType: 'store',
      ownerId: FERRETERIA,
      mime: 'image/png',
      status: 'pending',
    });
    // La key la genera la base: owner + uuid + extensión.
    expect(created.key.startsWith(`store/${FERRETERIA}/`)).toBe(true);
    expect(created.key.endsWith('.png')).toBe(true);

    const ready = await asUser(CARLOS, (tx) => markMediaReady(tx, created.id));
    expect(ready).toMatchObject({ id: created.id, status: 'ready' });
  });

  it('el dueño ve su media por owner; otro usuario no la ve (RLS)', async () => {
    const mine = await asUser(CARLOS, (tx) =>
      listMediaByOwner(tx, 'store', FERRETERIA),
    );
    expect(mine.length).toBeGreaterThan(0);

    // Lucía no creó esa media: la RLS (created_by) la oculta.
    const hers = await asUser(LUCIA, (tx) =>
      listMediaByOwner(tx, 'store', FERRETERIA),
    );
    expect(hers).toHaveLength(0);
  });

  it('se puede borrar la media propia', async () => {
    const [m] = await asUser(CARLOS, (tx) =>
      listMediaByOwner(tx, 'store', FERRETERIA),
    );
    const deleted = await asUser(CARLOS, (tx) => deleteMediaRecord(tx, m.id));
    expect(deleted?.id).toBe(m.id);
    const after = await asUser(CARLOS, (tx) =>
      listMediaByOwner(tx, 'store', FERRETERIA),
    );
    expect(after.map((x) => x.id)).not.toContain(m.id);
  });
});
