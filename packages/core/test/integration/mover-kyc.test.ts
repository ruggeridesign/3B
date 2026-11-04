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
import { readMe } from '../../src/modules/identity';
import {
  applyAsMover,
  getReviewCommunity,
  listPendingByCommunity,
  reviewSubmission,
} from '../../src/modules/identity/infra/kyc-repo';

// UUIDs del seed determinista. MARTA (miembro de Coro) se postula como Mover; LUCIA
// está fijada como no-Mover en otros tests, por eso no la usamos acá.
const ANA = '22222222-2222-2222-2222-222222222202'; // admin de comunidad (Coro)
const MARTA = '22222222-2222-2222-2222-222222222204'; // postulante a Mover
const CORO = '11111111-1111-1111-1111-111111111101';

const env = loadEnv();
// `app` (RLS) para el flujo; `owner` para limpiar el perfil/verificaciones de Mover.
const app = createAppDb(env.APP_DATABASE_URL);
const owner = createAppDb(env.DATABASE_URL);

function asUser<T>(userId: string, fn: (tx: AppTransaction) => Promise<T>) {
  return withAppContext(app.db, { userId }, fn);
}

afterAll(async () => {
  await owner.db
    .delete(schema.kycSubmissions)
    .where(
      and(
        eq(schema.kycSubmissions.subjectType, 'mover'),
        eq(schema.kycSubmissions.subjectId, MARTA),
      ),
    );
  await owner.db
    .delete(schema.moverProfiles)
    .where(eq(schema.moverProfiles.userId, MARTA));
  await app.client.end();
  await owner.client.end();
});

describe('mover kyc (M7d.2): postulación + aprobación de Movers + RLS', () => {
  it('MARTA se postula en Coro; ANA la aprueba → MARTA pasa a ser Mover', async () => {
    // Antes: MARTA no es Mover.
    const before = await asUser(MARTA, (tx) => readMe(tx, MARTA));
    expect(before?.capabilities.isMover).toBe(false);

    // Se postula → verificación de Mover `pending` apuntando a Coro.
    const apply = await asUser(MARTA, (tx) =>
      applyAsMover(tx, MARTA, { communityId: CORO, docType: 'cedula' }),
    );
    expect(apply.status).toBe('ok');
    if (apply.status !== 'ok') return;
    expect(apply.submission.subjectType).toBe('mover');
    expect(apply.submission.subjectId).toBe(MARTA);
    expect(apply.submission.communityId).toBe(CORO);
    expect(apply.submission.status).toBe('pending');
    const subId = apply.submission.id;

    // Perfil `pending` → aún no es Mover.
    const mid = await asUser(MARTA, (tx) => readMe(tx, MARTA));
    expect(mid?.capabilities.isMover).toBe(false);

    // Una segunda postulación a la misma comunidad: rechazada (ya pendiente).
    const again = await asUser(MARTA, (tx) =>
      applyAsMover(tx, MARTA, { communityId: CORO, docType: 'cedula' }),
    );
    expect(again.status).toBe('already_pending');

    // ANA (admin de Coro) la ve en la cola; la comunidad se resuelve a Coro.
    const queue = await asUser(ANA, (tx) => listPendingByCommunity(tx, CORO));
    expect(queue.some((s) => s.id === subId)).toBe(true);
    const community = await asUser(ANA, (tx) => getReviewCommunity(tx, subId));
    expect(community).toBe(CORO);

    // RLS: MARTA (no admin) no puede aprobar su propia verificación.
    const self = await asUser(MARTA, (tx) =>
      reviewSubmission(tx, subId, MARTA, 'approve', null),
    );
    expect(self).toBeNull();

    // ANA aprueba → el trigger pone el perfil `approved` + suma Coro.
    const approved = await asUser(ANA, (tx) =>
      reviewSubmission(tx, subId, ANA, 'approve', null),
    );
    expect(approved?.status).toBe('approved');

    // Ahora MARTA es Mover, con Coro en operating_communities.
    const after = await asUser(MARTA, (tx) => readMe(tx, MARTA));
    expect(after?.capabilities.isMover).toBe(true);

    const [profile] = await asUser(MARTA, (tx) =>
      tx
        .select({ oc: schema.moverProfiles.operatingCommunities })
        .from(schema.moverProfiles)
        .where(eq(schema.moverProfiles.userId, MARTA))
        .limit(1),
    );
    expect(profile?.oc).toContain(CORO);
  });
});
