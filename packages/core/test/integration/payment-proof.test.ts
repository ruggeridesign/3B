import { loadEnv } from '@3b/config';
import {
  type AppTransaction,
  createAppDb,
  eq,
  schema,
  withAppContext,
} from '@3b/db';
import { afterAll, describe, expect, it } from 'vitest';
import { createPendingMedia, markMediaReady } from '../../src/modules/media';
import { createOrder } from '../../src/modules/orders';

// UUIDs del seed determinista.
const CARLOS = '22222222-2222-2222-2222-222222222203'; // miembro de Ferretería
const PEDRO = '22222222-2222-2222-2222-222222222205'; // ni comprador ni tienda
const LUCIA = '22222222-2222-2222-2222-222222222206'; // Maker/comprador
const FERRETERIA = '33333333-3333-3333-3333-333333333301';
const NEGRO = '66666666-6666-6666-6666-666666666601'; // variante (no se reserva: sin aceptar)

const env = loadEnv();
const { db, client } = createAppDb(env.APP_DATABASE_URL);

function asUser<T>(userId: string, fn: (tx: AppTransaction) => Promise<T>) {
  return withAppContext(db, { userId }, fn);
}

/** ¿El usuario ve la media por id (bajo RLS)? */
async function mediaVisible(userId: string, mediaId: string): Promise<boolean> {
  const rows = await asUser(userId, (tx) =>
    tx
      .select({ id: schema.mediaFiles.id })
      .from(schema.mediaFiles)
      .where(eq(schema.mediaFiles.id, mediaId))
      .limit(1),
  );
  return rows.length > 0;
}

afterAll(async () => {
  await asUser(LUCIA, (tx) =>
    tx.delete(schema.mediaFiles).where(eq(schema.mediaFiles.createdBy, LUCIA)),
  );
  await client.end();
});

describe('payment proof (M5c.2): visibilidad media→pedido bajo RLS', () => {
  /** Crea un pedido de Lucía (queda `realizado`; NO se acepta → no reserva stock). */
  async function makeOrder(key: string): Promise<string> {
    const res = await asUser(LUCIA, (tx) =>
      createOrder(
        tx,
        LUCIA,
        {
          storeId: FERRETERIA,
          fulfillment: 'pickup',
          items: [{ variantId: NEGRO, qty: 1 }],
        },
        key,
      ),
    );
    if (res.status !== 'ok')
      throw new Error(`setup createOrder: ${res.status}`);
    return res.order.id;
  }

  it('la captura del comprobante la ve la tienda, no un tercero', async () => {
    const orderId = await makeOrder('m5c2-proof-key');
    const media = await asUser(LUCIA, (tx) =>
      createPendingMedia(tx, {
        ownerType: 'user',
        ownerId: LUCIA,
        mime: 'image/png',
      }),
    );
    await asUser(LUCIA, (tx) => markMediaReady(tx, media.id));

    // Adjuntar como comprobante (insert directo; la RLS deja al Maker dueño).
    await asUser(LUCIA, (tx) =>
      tx.insert(schema.paymentReports).values({
        orderId,
        method: 'pago_movil',
        amount: '49.90',
        currency: 'USD',
        reference: 'PROOF-REF-1',
        proofMediaId: media.id,
        reportedBy: LUCIA,
      }),
    );

    expect(await mediaVisible(LUCIA, media.id)).toBe(true); // dueña (created_by)
    expect(await mediaVisible(CARLOS, media.id)).toBe(true); // tienda (policy)
    expect(await mediaVisible(PEDRO, media.id)).toBe(false); // tercero: no
  });

  it('una media no adjunta a un pago no la ve la tienda (control)', async () => {
    const media = await asUser(LUCIA, (tx) =>
      createPendingMedia(tx, {
        ownerType: 'user',
        ownerId: LUCIA,
        mime: 'image/png',
      }),
    );
    expect(await mediaVisible(LUCIA, media.id)).toBe(true);
    expect(await mediaVisible(CARLOS, media.id)).toBe(false);
  });
});
