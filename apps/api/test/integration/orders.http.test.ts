import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { createApiApp } from '../../src/app';
import { createTestClient, SEED, signedInClient } from './helpers/client';

const api = createApiApp();

// UUIDs del seed determinista (tienda de Carlos en Coro + variante del taladro).
const FERRETERIA = '33333333-3333-3333-3333-333333333301';
const NEGRO = '66666666-6666-6666-6666-666666666601'; // $49.90

afterAll(async () => {
  await api.close();
});

function orderBody(qty = 1) {
  return JSON.stringify({
    storeId: FERRETERIA,
    fulfillment: 'pickup',
    items: [{ variantId: NEGRO, qty }],
  });
}

describe('POST/GET /v1/orders — checkout del Maker (capa HTTP)', () => {
  it('crea un pedido con Idempotency-Key (201) y precios congelados', async () => {
    const lucia = await signedInClient(api.app, SEED.lucia);
    const res = await lucia.request('/v1/orders', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'Idempotency-Key': `http-order-${randomUUID()}`,
      },
      body: orderBody(1),
    });
    expect([200, 201]).toContain(res.status);
    const order = (await res.json()) as {
      status: string;
      items: Array<{ sku: string | null; unitPrice: string }>;
    };
    expect(order.status).toBe('realizado');
    expect(order.items[0]?.sku).toBe('TAL-650-NEGRO');
    expect(order.items[0]?.unitPrice).toBe('49.90');
  });

  it('sin Idempotency-Key → 400', async () => {
    const lucia = await signedInClient(api.app, SEED.lucia);
    const res = await lucia.request('/v1/orders', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: orderBody(1),
    });
    expect(res.status).toBe(400);
  });

  it('body inválido (qty 0) → error de validación 4xx', async () => {
    const lucia = await signedInClient(api.app, SEED.lucia);
    const res = await lucia.request('/v1/orders', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'Idempotency-Key': `http-bad-${randomUUID()}`,
      },
      body: JSON.stringify({
        storeId: FERRETERIA,
        fulfillment: 'pickup',
        items: [{ variantId: NEGRO, qty: 0 }],
      }),
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it('sin sesión → 401', async () => {
    const anon = createTestClient(api.app);
    const res = await anon.request('/v1/orders', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'Idempotency-Key': `http-anon-${randomUUID()}`,
      },
      body: orderBody(1),
    });
    expect(res.status).toBe(401);
  });

  it('GET /v1/orders lista mis pedidos', async () => {
    const lucia = await signedInClient(api.app, SEED.lucia);
    await lucia.request('/v1/orders', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'Idempotency-Key': `http-list-${randomUUID()}`,
      },
      body: orderBody(1),
    });
    const res = await lucia.request('/v1/orders');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { orders: Array<{ storeId: string }> };
    expect(body.orders.some((o) => o.storeId === FERRETERIA)).toBe(true);
  });
});
