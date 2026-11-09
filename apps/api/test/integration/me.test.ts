import type { MeResponse } from '@3b/contracts';
import { afterAll, describe, expect, it } from 'vitest';
import { createApiApp } from '../../src/app';
import { createTestClient, SEED } from './helpers/client';

// La app completa, in-process. Cada test usa su propio cliente (cookie jar).
const api = createApiApp();

afterAll(async () => {
  await api.close();
});

async function meFor(email: string): Promise<MeResponse> {
  const client = createTestClient(api.app);
  await client.signIn(email);
  const res = await client.request('/v1/me');
  expect(res.status).toBe(200);
  return (await res.json()) as MeResponse;
}

describe('GET /v1/me — capacidades resueltas por usuario (capa HTTP)', () => {
  it('admin: admin de plataforma', async () => {
    const me = await meFor(SEED.admin);
    expect(me.capabilities).toMatchObject({
      isMaker: true,
      isSeller: false,
      isMover: false,
      isPlatformAdmin: true,
    });
  });

  it('ana: admin de comunidad (Coro), no Seller/Mover/Admin', async () => {
    const me = await meFor(SEED.ana);
    expect(me.capabilities).toMatchObject({
      isSeller: false,
      isMover: false,
      isPlatformAdmin: false,
    });
    expect(me.communities.some((c) => c.role === 'admin')).toBe(true);
  });

  it('carlos: Seller (dueño de tiendas)', async () => {
    const me = await meFor(SEED.carlos);
    expect(me.capabilities.isSeller).toBe(true);
    expect(me.stores.length).toBeGreaterThanOrEqual(1);
  });

  it('marta: Seller', async () => {
    const me = await meFor(SEED.marta);
    expect(me.capabilities.isSeller).toBe(true);
  });

  it('pedro: Mover (perfil aprobado)', async () => {
    const me = await meFor(SEED.pedro);
    expect(me.capabilities.isMover).toBe(true);
    expect(me.capabilities.isSeller).toBe(false);
  });

  it('lucia: solo Maker, sin tiendas', async () => {
    const me = await meFor(SEED.lucia);
    expect(me.capabilities).toMatchObject({
      isMaker: true,
      isSeller: false,
      isMover: false,
      isPlatformAdmin: false,
    });
    expect(me.stores).toHaveLength(0);
  });
});
