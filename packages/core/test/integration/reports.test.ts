import { loadEnv } from '@3b/config';
import { type AppTransaction, createAppDb, withAppContext } from '@3b/db';
import { afterAll, describe, expect, it } from 'vitest';
import {
  createReport,
  listReports,
  resolveReport,
} from '../../src/modules/social';

// UUIDs del seed determinista.
const ANA = '22222222-2222-2222-2222-222222222202'; // admin de comunidad (Coro)
const PEDRO = '22222222-2222-2222-2222-222222222205'; // Punto Fijo, no admin ni reporter
const LUCIA = '22222222-2222-2222-2222-222222222206'; // Maker (Coro)
const TALADRO = '44444444-4444-4444-4444-444444444401'; // ítem publicado (Coro)

const env = loadEnv();
const { db, client } = createAppDb(env.APP_DATABASE_URL);

function asUser<T>(userId: string, fn: (tx: AppTransaction) => Promise<T>) {
  return withAppContext(db, { userId }, fn);
}

afterAll(async () => {
  await client.end();
});

describe('reports (M5d.4): moderación de contenido bajo RLS', () => {
  it('reportar un ítem deriva la comunidad del target', async () => {
    const res = await asUser(LUCIA, (tx) =>
      createReport(tx, LUCIA, {
        targetType: 'item',
        targetId: TALADRO,
        reason: 'Precio engañoso',
      }),
    );
    expect(res.status).toBe('ok');
    if (res.status === 'ok') {
      expect(res.report.status).toBe('open');
      expect(res.report.communityId).toBe(
        '11111111-1111-1111-1111-111111111101', // CORO, derivada del ítem
      );
    }
  });

  it('reportar un target inexistente devuelve target_not_found', async () => {
    const res = await asUser(LUCIA, (tx) =>
      createReport(tx, LUCIA, {
        targetType: 'item',
        targetId: '44444444-4444-4444-4444-4444444444ff',
        reason: 'no existe',
      }),
    );
    expect(res.status).toBe('target_not_found');
  });

  it('RLS: el reporter ve su reporte; un tercero no', async () => {
    const made = await asUser(LUCIA, (tx) =>
      createReport(tx, LUCIA, {
        targetType: 'item',
        targetId: TALADRO,
        reason: 'Contenido duplicado',
      }),
    );
    if (made.status !== 'ok') throw new Error('setup report');

    const mine = await asUser(LUCIA, (tx) => listReports(tx));
    expect(mine.some((r) => r.id === made.report.id)).toBe(true);

    const theirs = await asUser(PEDRO, (tx) => listReports(tx));
    expect(theirs.some((r) => r.id === made.report.id)).toBe(false);
  });

  it('solo un admin resuelve; el reporter no', async () => {
    const made = await asUser(LUCIA, (tx) =>
      createReport(tx, LUCIA, {
        targetType: 'item',
        targetId: TALADRO,
        reason: 'Spam',
      }),
    );
    if (made.status !== 'ok') throw new Error('setup report');

    // Lucía (no admin) no puede resolver → la RLS no afecta ninguna fila.
    const denied = await asUser(LUCIA, (tx) =>
      resolveReport(tx, made.report.id, LUCIA, 'resolved', null),
    );
    expect(denied.status).toBe('not_found');

    // Ana (admin de Coro) sí.
    const ok = await asUser(ANA, (tx) =>
      resolveReport(tx, made.report.id, ANA, 'resolved', 'Revisado'),
    );
    expect(ok.status).toBe('ok');
    if (ok.status === 'ok') expect(ok.report.status).toBe('resolved');
  });
});
