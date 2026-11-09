import type { MeResponse } from '@3b/contracts';
import { afterAll, describe, expect, it } from 'vitest';
import { createApiApp } from '../../src/app';
import {
  type createTestClient,
  IDS,
  SEED,
  signedInClient,
} from './helpers/client';

const api = createApiApp();

afterAll(async () => {
  await api.close();
});

async function me(client: ReturnType<typeof createTestClient>) {
  const res = await client.request('/v1/me');
  expect(res.status).toBe(200);
  return (await res.json()) as MeResponse;
}

describe('"Ver como" (impersonación) — capa HTTP', () => {
  it('admin impersona a Pedro: /v1/me pasa a Mover y marca quién impersona', async () => {
    const admin = await signedInClient(api.app, SEED.admin);
    expect((await me(admin)).capabilities.isPlatformAdmin).toBe(true);

    const imp = await admin.request('/v1/admin/impersonate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId: IDS.pedro }),
    });
    expect(imp.status).toBe(200);

    const asPedro = await me(admin);
    expect(asPedro.user.email).toBe(SEED.pedro);
    expect(asPedro.capabilities.isMover).toBe(true);
    expect(asPedro.capabilities.isPlatformAdmin).toBe(false);
    expect(asPedro.impersonating?.byEmail).toBe(SEED.admin);
  });

  it('REGRESIÓN: /v1/admin/users responde 200 aun mientras se impersona', async () => {
    const admin = await signedInClient(api.app, SEED.admin);
    await admin.request('/v1/admin/impersonate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId: IDS.pedro }),
    });
    const res = await admin.request('/v1/admin/users');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { users: unknown[] };
    expect(body.users.length).toBeGreaterThanOrEqual(6);
  });

  it('DELETE vuelve a la cuenta real (admin, sin impersonación)', async () => {
    const admin = await signedInClient(api.app, SEED.admin);
    await admin.request('/v1/admin/impersonate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId: IDS.pedro }),
    });
    const stop = await admin.request('/v1/admin/impersonate', {
      method: 'DELETE',
    });
    expect(stop.status).toBe(200);

    const back = await me(admin);
    expect(back.user.email).toBe(SEED.admin);
    expect(back.capabilities.isPlatformAdmin).toBe(true);
    expect(back.impersonating).toBeNull();
  });

  it('un no-admin (lucia) no puede impersonar → 403', async () => {
    const lucia = await signedInClient(api.app, SEED.lucia);
    const res = await lucia.request('/v1/admin/impersonate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId: IDS.carlos }),
    });
    expect(res.status).toBe(403);
  });
});
