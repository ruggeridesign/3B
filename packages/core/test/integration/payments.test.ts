import { loadEnv } from '@3b/config';
import { type AppTransaction, createAppDb, withAppContext } from '@3b/db';
import { afterAll, describe, expect, it } from 'vitest';
import { getLevel } from '../../src/modules/inventory';
import {
  createOrder,
  getOrder,
  transitionOrder,
} from '../../src/modules/orders';
import {
  listPaymentsForOrder,
  reportPayment,
  reviewPayment,
} from '../../src/modules/payments';

// UUIDs del seed determinista.
const CARLOS = '22222222-2222-2222-2222-222222222203'; // owner de Ferretería
const PEDRO = '22222222-2222-2222-2222-222222222205'; // ni Maker ni miembro
const LUCIA = '22222222-2222-2222-2222-222222222206'; // Maker (Coro)
const FERRETERIA = '33333333-3333-3333-3333-333333333301';
const AZUL = '66666666-6666-6666-6666-666666666602'; // variante con stock (12)

const env = loadEnv();
const { db, client } = createAppDb(env.APP_DATABASE_URL);

function asUser<T>(userId: string, fn: (tx: AppTransaction) => Promise<T>) {
  return withAppContext(db, { userId }, fn);
}

afterAll(async () => {
  await client.end();
});

describe('payments (M5c): reporte de pago + confirmación bajo RLS', () => {
  /** Crea un pedido de Lucía con la variante AZUL y `qty`, en estado `realizado`. */
  async function makeOrder(qty: number, key: string): Promise<string> {
    const res = await asUser(LUCIA, (tx) =>
      createOrder(
        tx,
        LUCIA,
        {
          storeId: FERRETERIA,
          fulfillment: 'pickup',
          items: [{ variantId: AZUL, qty }],
        },
        key,
      ),
    );
    if (res.status !== 'ok')
      throw new Error(`setup createOrder: ${res.status}`);
    return res.order.id;
  }

  /** Lo lleva hasta `aceptado` (el Seller acepta → reserva). */
  async function accept(orderId: string): Promise<void> {
    const r = await asUser(CARLOS, (tx) =>
      transitionOrder(tx, orderId, CARLOS, 'aceptado', null),
    );
    if (r.status !== 'ok') throw new Error(`setup accept: ${r.status}`);
  }

  async function reservedOf(variantId: string): Promise<number> {
    const lvl = await asUser(CARLOS, (tx) => getLevel(tx, variantId));
    return lvl?.reserved ?? 0;
  }

  it('el Maker reporta un pago: pedido → pago_reportado y se congela fx_rate (P-2)', async () => {
    const orderId = await makeOrder(1, 'm5c-report-key');
    await accept(orderId);

    const res = await asUser(LUCIA, (tx) =>
      reportPayment(tx, orderId, LUCIA, {
        method: 'pago_movil',
        reference: 'REF-0001',
        amount: '49.90',
        currency: 'USD',
      }),
    );
    expect(res.status).toBe('ok');
    if (res.status === 'ok') expect(res.payment.status).toBe('reported');

    const after = await asUser(LUCIA, (tx) => getOrder(tx, orderId));
    expect(after?.status).toBe('pago_reportado');
    expect(after?.fxRateVes).toBe('52.3600'); // tasa del seed, congelada
  });

  it('bloquea una referencia duplicada (P-1)', async () => {
    const orderId = await makeOrder(1, 'm5c-dup-key');
    await accept(orderId);
    const res = await asUser(LUCIA, (tx) =>
      reportPayment(tx, orderId, LUCIA, {
        method: 'pago_movil',
        reference: 'REF-0001', // misma del test anterior
        amount: '49.90',
        currency: 'USD',
      }),
    );
    expect(res.status).toBe('duplicate_reference');
  });

  it('no se puede reportar si el pedido no está aceptado', async () => {
    const orderId = await makeOrder(1, 'm5c-state-key'); // queda en realizado
    const res = await asUser(LUCIA, (tx) =>
      reportPayment(tx, orderId, LUCIA, {
        method: 'zelle',
        reference: 'REF-STATE',
        amount: '49.90',
        currency: 'USD',
      }),
    );
    expect(res.status).toBe('invalid_state');
  });

  it('el Seller confirma el pago: pedido → pago_confirmado (salida de M5c)', async () => {
    const orderId = await makeOrder(1, 'm5c-confirm-key');
    await accept(orderId);
    const reported = await asUser(LUCIA, (tx) =>
      reportPayment(tx, orderId, LUCIA, {
        method: 'transferencia',
        reference: 'REF-CONFIRM',
        amount: '49.90',
        currency: 'USD',
      }),
    );
    if (reported.status !== 'ok') throw new Error('setup report');

    const res = await asUser(CARLOS, (tx) =>
      reviewPayment(tx, orderId, reported.payment.id, CARLOS, 'confirm', null),
    );
    expect(res.status).toBe('ok');
    if (res.status === 'ok') expect(res.payment.status).toBe('confirmed');

    const after = await asUser(CARLOS, (tx) => getOrder(tx, orderId));
    expect(after?.status).toBe('pago_confirmado');
  });

  it('el Seller rechaza el pago: pedido → pago_rechazado y libera la reserva', async () => {
    const orderId = await makeOrder(2, 'm5c-reject-key');
    const base = await reservedOf(AZUL);
    await accept(orderId);
    expect(await reservedOf(AZUL)).toBe(base + 2);

    const reported = await asUser(LUCIA, (tx) =>
      reportPayment(tx, orderId, LUCIA, {
        method: 'binance',
        reference: 'REF-REJECT',
        amount: '99.80',
        currency: 'USD',
      }),
    );
    if (reported.status !== 'ok') throw new Error('setup report');

    const res = await asUser(CARLOS, (tx) =>
      reviewPayment(
        tx,
        orderId,
        reported.payment.id,
        CARLOS,
        'reject',
        'falso',
      ),
    );
    expect(res.status).toBe('ok');
    const after = await asUser(CARLOS, (tx) => getOrder(tx, orderId));
    expect(after?.status).toBe('pago_rechazado');
    expect(await reservedOf(AZUL)).toBe(base); // reserva devuelta
  });

  it('RLS: un tercero no puede reportar (no ve el pedido)', async () => {
    const orderId = await makeOrder(1, 'm5c-rls-key');
    await accept(orderId);
    const res = await asUser(PEDRO, (tx) =>
      reportPayment(tx, orderId, PEDRO, {
        method: 'efectivo',
        reference: 'REF-RLS',
        amount: '49.90',
        currency: 'USD',
      }),
    );
    expect(res.status).toBe('order_not_found');

    // El Maker y la tienda sí ven los comprobantes; un tercero no.
    const seen = await asUser(PEDRO, (tx) => listPaymentsForOrder(tx, orderId));
    expect(seen).toHaveLength(0);
  });
});
