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
  deleteSubscription,
  listSubscriptionsForUser,
  upsertSubscription,
} from '../../src/modules/notifications';

// UUIDs del seed determinista.
const ANA = '22222222-2222-2222-2222-222222222202'; // tercero
const LUCIA = '22222222-2222-2222-2222-222222222206'; // dueño de la suscripción

// Endpoint propio de este test (la DB es compartida; ver memoria del proyecto).
const ENDPOINT = 'https://push.example.com/sub/m8d-lucia-test';

const env = loadEnv();
const { db, client } = createAppDb(env.APP_DATABASE_URL);

function asUser<T>(userId: string, fn: (tx: AppTransaction) => Promise<T>) {
  return withAppContext(db, { userId }, fn);
}

afterAll(async () => {
  await asUser(LUCIA, (tx) => deleteSubscription(tx, ENDPOINT));
  await client.end();
});

describe('notifications (M8d): suscripciones push bajo RLS', () => {
  it('upsert idempotente por endpoint; el dueño las ve', async () => {
    await asUser(LUCIA, (tx) =>
      upsertSubscription(
        tx,
        LUCIA,
        { endpoint: ENDPOINT, keys: { p256dh: 'aaa', auth: 'bbb' } },
        'ua-1',
      ),
    );
    // Re-suscribir el mismo navegador (mismo endpoint) actualiza, no duplica.
    await asUser(LUCIA, (tx) =>
      upsertSubscription(
        tx,
        LUCIA,
        { endpoint: ENDPOINT, keys: { p256dh: 'ccc', auth: 'ddd' } },
        'ua-2',
      ),
    );

    const mine = (
      await asUser(LUCIA, (tx) => listSubscriptionsForUser(tx, LUCIA))
    ).filter((s) => s.endpoint === ENDPOINT);
    expect(mine.length).toBe(1);
    expect(mine[0]?.p256dh).toBe('ccc');
  });

  it('RLS: un tercero no ve ni borra la suscripción ajena', async () => {
    // Ana no ve la suscripción de Lucía (SELECT directo bajo su contexto).
    const seen = await asUser(ANA, (tx) =>
      tx
        .select()
        .from(schema.pushSubscriptions)
        .where(eq(schema.pushSubscriptions.endpoint, ENDPOINT)),
    );
    expect(seen.length).toBe(0);

    // Ana intenta borrarla: la RLS no afecta ninguna fila ajena → sigue existiendo.
    await asUser(ANA, (tx) => deleteSubscription(tx, ENDPOINT));
    const stillThere = await asUser(LUCIA, (tx) =>
      listSubscriptionsForUser(tx, LUCIA),
    );
    expect(stillThere.some((s) => s.endpoint === ENDPOINT)).toBe(true);
  });
});
