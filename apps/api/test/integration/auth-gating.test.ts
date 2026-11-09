import { afterAll, describe, expect, it } from 'vitest';
import { createApiApp } from '../../src/app';
import { createTestClient, SEED, signedInClient } from './helpers/client';

const api = createApiApp();

afterAll(async () => {
  await api.close();
});

describe('Gating de autenticación y capacidad (capa HTTP)', () => {
  it('sin sesión: /v1/me → 401', async () => {
    const anon = createTestClient(api.app);
    const res = await anon.request('/v1/me');
    expect(res.status).toBe(401);
  });

  it('sin sesión: /v1/admin/users → 401', async () => {
    const anon = createTestClient(api.app);
    const res = await anon.request('/v1/admin/users');
    expect(res.status).toBe(401);
  });

  it('no-admin (lucia): /v1/admin/users → 403', async () => {
    const lucia = await signedInClient(api.app, SEED.lucia);
    const res = await lucia.request('/v1/admin/users');
    expect(res.status).toBe(403);
  });

  it('admin: /v1/admin/users → 200 con capacidades por usuario', async () => {
    const admin = await signedInClient(api.app, SEED.admin);
    const res = await admin.request('/v1/admin/users');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      users: Array<{ email: string; isSeller: boolean; isMover: boolean }>;
    };
    expect(body.users.length).toBeGreaterThanOrEqual(6);
    // El reader expone las capacidades que usa el selector "Ver como".
    expect(body.users.some((u) => u.isMover)).toBe(true);
    expect(body.users.some((u) => u.isSeller)).toBe(true);
  });
});
