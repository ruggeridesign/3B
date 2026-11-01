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
  createStoreHour,
  deleteStoreHour,
  listStoreHours,
} from '../../src/modules/store';

// UUIDs del seed determinista.
const CARLOS = '22222222-2222-2222-2222-222222222203'; // owner de Ferretería
const MARTA = '22222222-2222-2222-2222-222222222204'; // sales (no administra)
const LUCIA = '22222222-2222-2222-2222-222222222206'; // miembro de CORO, no de la tienda
const FERRETERIA = '33333333-3333-3333-3333-333333333301'; // en CORO, sin horario en el seed

// Día de prueba (miércoles) para no chocar con otros datos.
const TEST_WEEKDAY = 3;

const env = loadEnv();
const { db, client } = createAppDb(env.APP_DATABASE_URL);

function asUser<T>(userId: string, fn: (tx: AppTransaction) => Promise<T>) {
  return withAppContext(db, { userId }, fn);
}

afterAll(async () => {
  await asUser(CARLOS, (tx) =>
    tx
      .delete(schema.storeHours)
      .where(
        and(
          eq(schema.storeHours.storeId, FERRETERIA),
          eq(schema.storeHours.weekday, TEST_WEEKDAY),
        ),
      ),
  );
  await client.end();
});

describe('store: horarios bajo RLS', () => {
  it('owner crea intervalos y los lista; un par de comunidad también los ve', async () => {
    await asUser(CARLOS, (tx) =>
      createStoreHour(tx, {
        storeId: FERRETERIA,
        weekday: TEST_WEEKDAY,
        opensMin: 540,
        closesMin: 780,
      }),
    );
    await asUser(CARLOS, (tx) =>
      createStoreHour(tx, {
        storeId: FERRETERIA,
        weekday: TEST_WEEKDAY,
        opensMin: 840,
        closesMin: 1080,
      }),
    );

    const mine = (await asUser(CARLOS, (tx) => listStoreHours(tx, FERRETERIA)))
      .filter((h) => h.weekday === TEST_WEEKDAY)
      .map((h) => `${h.opensMin}-${h.closesMin}`);
    expect(mine).toEqual(['540-780', '840-1080']);

    // Los horarios son públicos a la comunidad: Lucía (CORO) ve la tienda y su
    // horario aunque no sea del equipo.
    const hers = (await asUser(LUCIA, (tx) => listStoreHours(tx, FERRETERIA)))
      .filter((h) => h.weekday === TEST_WEEKDAY)
      .map((h) => `${h.opensMin}-${h.closesMin}`);
    expect(hers).toEqual(['540-780', '840-1080']);
  });

  it('sales NO puede crear (RLS); owner borra', async () => {
    await expect(
      asUser(MARTA, (tx) =>
        createStoreHour(tx, {
          storeId: FERRETERIA,
          weekday: TEST_WEEKDAY,
          opensMin: 600,
          closesMin: 700,
        }),
      ),
    ).rejects.toThrow();

    const [first] = (
      await asUser(CARLOS, (tx) => listStoreHours(tx, FERRETERIA))
    ).filter((h) => h.weekday === TEST_WEEKDAY);
    const ok = await asUser(CARLOS, (tx) =>
      deleteStoreHour(tx, FERRETERIA, first.id),
    );
    expect(ok).toBe(true);
  });
});
