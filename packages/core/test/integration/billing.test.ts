import { loadEnv } from '@3b/config';
import { type AppTransaction, createAppDb, withAppContext } from '@3b/db';
import { afterAll, describe, expect, it } from 'vitest';
import {
  getSubscription,
  listPlans,
  setSubscription,
} from '../../src/modules/billing';

// UUIDs del seed determinista.
const ANA = '22222222-2222-2222-2222-222222222202'; // admin de comunidad (Coro)
const CARLOS = '22222222-2222-2222-2222-222222222203'; // dueño de Ferretería
const PEDRO = '22222222-2222-2222-2222-222222222205'; // ni tienda ni admin de Coro
const FERRETERIA = '33333333-3333-3333-3333-333333333301'; // productos, Coro

const env = loadEnv();
const { db, client } = createAppDb(env.APP_DATABASE_URL);

function asUser<T>(userId: string, fn: (tx: AppTransaction) => Promise<T>) {
  return withAppContext(db, { userId }, fn);
}

afterAll(async () => {
  await client.end();
});

describe('billing (M7a): planes + suscripciones bajo RLS', () => {
  it('lista los planes (lectura pública)', async () => {
    const plans = await asUser(CARLOS, (tx) => listPlans(tx));
    expect(plans.map((p) => p.code).sort()).toEqual([
      'seller_products',
      'seller_services',
    ]);
  });

  it('la tienda nace con una suscripción trial (trigger) y el dueño la ve', async () => {
    const sub = await asUser(CARLOS, (tx) => getSubscription(tx, FERRETERIA));
    expect(sub?.status).toBe('trial');
    expect(sub?.planCode).toBe('seller_products'); // Ferretería es de productos
    expect(sub?.periodEnd).not.toBeNull();
  });

  it('RLS: un tercero no ve la suscripción de la tienda', async () => {
    const seen = await asUser(PEDRO, (tx) => getSubscription(tx, FERRETERIA));
    expect(seen).toBeNull();
  });

  it('solo un admin cambia la suscripción; el dueño no', async () => {
    // Carlos es dueño (miembro) pero NO admin: la RLS de UPDATE lo bloquea.
    const denied = await asUser(CARLOS, (tx) =>
      setSubscription(tx, FERRETERIA, { status: 'active' }),
    );
    expect(denied.status).toBe('not_found');

    // Ana (admin de Coro) sí la activa.
    const ok = await asUser(ANA, (tx) =>
      setSubscription(tx, FERRETERIA, { status: 'active' }),
    );
    expect(ok.status).toBe('ok');
    if (ok.status === 'ok') expect(ok.subscription.status).toBe('active');
  });
});
