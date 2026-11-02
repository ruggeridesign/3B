import { loadEnv } from '@3b/config';
import { type AppTransaction, createAppDb, withAppContext } from '@3b/db';
import { afterAll, describe, expect, it } from 'vitest';
import {
  getOrderThread,
  markOrderThreadRead,
  sendOrderMessage,
} from '../../src/modules/messaging';
import { createOrder } from '../../src/modules/orders';

// UUIDs del seed determinista.
const CARLOS = '22222222-2222-2222-2222-222222222203'; // miembro de Ferretería
const PEDRO = '22222222-2222-2222-2222-222222222205'; // ni Maker ni miembro
const LUCIA = '22222222-2222-2222-2222-222222222206'; // Maker (Coro)
const FERRETERIA = '33333333-3333-3333-3333-333333333301';
const AZUL = '66666666-6666-6666-6666-666666666602'; // variante con stock

const env = loadEnv();
const { db, client } = createAppDb(env.APP_DATABASE_URL);

function asUser<T>(userId: string, fn: (tx: AppTransaction) => Promise<T>) {
  return withAppContext(db, { userId }, fn);
}

afterAll(async () => {
  await client.end();
});

describe('messaging (M5d.1): chat del pedido bajo RLS', () => {
  /** Crea un pedido de Lucía con la variante AZUL en estado `realizado`. */
  async function makeOrder(key: string): Promise<string> {
    const res = await asUser(LUCIA, (tx) =>
      createOrder(
        tx,
        LUCIA,
        {
          storeId: FERRETERIA,
          fulfillment: 'pickup',
          items: [{ variantId: AZUL, qty: 1 }],
        },
        key,
      ),
    );
    if (res.status !== 'ok')
      throw new Error(`setup createOrder: ${res.status}`);
    return res.order.id;
  }

  it('el Maker escribe y la tienda ve el hilo (conversación perezosa)', async () => {
    const orderId = await makeOrder('m5d-msg-key');

    const sent = await asUser(LUCIA, (tx) =>
      sendOrderMessage(tx, orderId, LUCIA, {
        body: 'Hola, ¿cuándo lo retiro?',
      }),
    );
    expect(sent.status).toBe('ok');
    if (sent.status === 'ok') expect(sent.message.senderId).toBe(LUCIA);

    // La tienda (Carlos, miembro) ve el hilo y el mensaje del comprador.
    const seen = await asUser(CARLOS, (tx) => getOrderThread(tx, orderId));
    expect(seen?.conversation.context).toBe('order');
    expect(seen?.messages).toHaveLength(1);
    expect(seen?.messages[0]?.body).toBe('Hola, ¿cuándo lo retiro?');
  });

  it('la tienda responde y el hilo queda ordenado', async () => {
    const orderId = await makeOrder('m5d-reply-key');
    await asUser(LUCIA, (tx) =>
      sendOrderMessage(tx, orderId, LUCIA, { body: 'Primero (comprador)' }),
    );
    const reply = await asUser(CARLOS, (tx) =>
      sendOrderMessage(tx, orderId, CARLOS, { body: 'Segundo (tienda)' }),
    );
    expect(reply.status).toBe('ok');

    const thread = await asUser(LUCIA, (tx) => getOrderThread(tx, orderId));
    expect(thread?.messages).toHaveLength(2);
    expect(thread?.messages[0]?.senderId).toBe(LUCIA);
    expect(thread?.messages[1]?.senderId).toBe(CARLOS);
  });

  it('marcar leído afecta solo los mensajes entrantes', async () => {
    const orderId = await makeOrder('m5d-read-key');
    await asUser(LUCIA, (tx) =>
      sendOrderMessage(tx, orderId, LUCIA, { body: 'del comprador' }),
    );
    await asUser(CARLOS, (tx) =>
      sendOrderMessage(tx, orderId, CARLOS, { body: 'de la tienda' }),
    );

    // Lucía abre el hilo y marca como leído: solo el de la tienda (entrante).
    await asUser(LUCIA, (tx) => markOrderThreadRead(tx, orderId, LUCIA));

    const thread = await asUser(LUCIA, (tx) => getOrderThread(tx, orderId));
    const mine = thread?.messages.find((m) => m.senderId === LUCIA);
    const theirs = thread?.messages.find((m) => m.senderId === CARLOS);
    expect(theirs?.readAt).not.toBeNull(); // entrante → leído
    expect(mine?.readAt).toBeNull(); // propio → sin tocar
  });

  it('RLS: un tercero no ve ni escribe en el hilo', async () => {
    const orderId = await makeOrder('m5d-rls-key');
    await asUser(LUCIA, (tx) =>
      sendOrderMessage(tx, orderId, LUCIA, { body: 'privado' }),
    );

    const seen = await asUser(PEDRO, (tx) => getOrderThread(tx, orderId));
    expect(seen).toBeNull();

    const sent = await asUser(PEDRO, (tx) =>
      sendOrderMessage(tx, orderId, PEDRO, { body: 'colado' }),
    );
    expect(sent.status).toBe('not_found');
  });
});
