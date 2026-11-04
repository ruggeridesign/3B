import { loadEnv } from '@3b/config';
import { type AppTransaction, createAppDb, withAppContext } from '@3b/db';
import { afterAll, describe, expect, it } from 'vitest';
import { getCommunityMetrics } from '../../src/modules/identity/infra/metrics-repo';

// UUIDs del seed determinista.
const ADMIN = '22222222-2222-2222-2222-222222222201'; // admin de plataforma
const ANA = '22222222-2222-2222-2222-222222222202'; // admin de comunidad (Coro)
const LUCIA = '22222222-2222-2222-2222-222222222206'; // miembro de Coro, no admin
const CORO = '11111111-1111-1111-1111-111111111101';

const env = loadEnv();
const { db, client } = createAppDb(env.APP_DATABASE_URL);

function asUser<T>(userId: string, fn: (tx: AppTransaction) => Promise<T>) {
  return withAppContext(db, { userId }, fn);
}

afterAll(async () => {
  await client.end();
});

describe('community metrics (M7d.3): tablero del admin de comunidad', () => {
  it('el admin de la comunidad obtiene los conteos (función definer auto-guardada)', async () => {
    const m = await asUser(ANA, (tx) => getCommunityMetrics(tx, CORO));
    expect(m).not.toBeNull();
    if (!m) return;
    // Baseline del seed: Ferretería (Coro) + Pedro opera en Coro (aprobado).
    expect(m.stores).toBeGreaterThanOrEqual(1);
    expect(m.movers).toBeGreaterThanOrEqual(1);
    expect(m.orders).toBeGreaterThanOrEqual(0);
    expect(m.pendingCollections).toBeGreaterThanOrEqual(0);
    expect(m.openReports).toBeGreaterThanOrEqual(0);
    expect(m.gmv).toMatch(/^\d+\.\d{2}$/); // dinero como string
  });

  it('un admin de plataforma también los obtiene', async () => {
    const m = await asUser(ADMIN, (tx) => getCommunityMetrics(tx, CORO));
    expect(m).not.toBeNull();
  });

  it('un miembro que no es admin NO obtiene métricas (auto-guarda → null)', async () => {
    const m = await asUser(LUCIA, (tx) => getCommunityMetrics(tx, CORO));
    expect(m).toBeNull();
  });
});
