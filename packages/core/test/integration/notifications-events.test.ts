import { loadEnv } from '@3b/config';
import { createAppDb, eq, schema } from '@3b/db';
import { afterAll, describe, expect, it } from 'vitest';
import {
  conversationContext,
  orderBrief,
} from '../../src/modules/notifications';

// UUIDs del seed determinista.
const CARLOS = '22222222-2222-2222-2222-222222222203'; // miembro de la ferretería
const PEDRO = '22222222-2222-2222-2222-222222222205'; // Mover aprobado
const LUCIA = '22222222-2222-2222-2222-222222222206'; // comprador
const FERRETERIA = '33333333-3333-3333-3333-333333333301';

const env = loadEnv();
const owner = createAppDb(env.DATABASE_URL);

let orderId = '';
let shipmentId = '';
let conversationId = '';
let communityId = '';

/** Busca en el outbox un evento de un topic por una clave del payload. */
async function outboxPayload(
  topic: string,
  key: string,
  value: string,
): Promise<Record<string, unknown> | undefined> {
  const rows = await owner.db
    .select({ payload: schema.outbox.payload })
    .from(schema.outbox)
    .where(eq(schema.outbox.topic, topic));
  return rows
    .map((r) => r.payload as Record<string, unknown>)
    .find((p) => p[key] === value);
}

afterAll(async () => {
  if (conversationId) {
    await owner.db
      .delete(schema.conversations)
      .where(eq(schema.conversations.id, conversationId));
  }
  if (shipmentId) {
    await owner.db
      .delete(schema.shipments)
      .where(eq(schema.shipments.id, shipmentId));
  }
  if (orderId) {
    await owner.db
      .delete(schema.orderRecords)
      .where(eq(schema.orderRecords.id, orderId));
  }
  await owner.client.end();
});

describe('notifications events (M8d.2b): triggers → outbox', () => {
  it('estado de pedido → comprador: UPDATE status emite order.status_changed', async () => {
    const [store] = await owner.db
      .select({ communityId: schema.stores.communityId })
      .from(schema.stores)
      .where(eq(schema.stores.id, FERRETERIA));
    if (!store) throw new Error('store no encontrada');
    communityId = store.communityId;

    const [order] = await owner.db
      .insert(schema.orderRecords)
      .values({
        storeId: FERRETERIA,
        communityId,
        makerId: LUCIA,
        fulfillment: 'pickup',
        subtotal: '10.00',
        total: '10.00',
        currency: 'USD',
      })
      .returning({
        id: schema.orderRecords.id,
        number: schema.orderRecords.number,
      });
    if (!order) throw new Error('no se creó el pedido');
    orderId = order.id;

    await owner.db
      .update(schema.orderRecords)
      .set({ status: 'aceptado' })
      .where(eq(schema.orderRecords.id, orderId));

    const p = await outboxPayload('order.status_changed', 'orderId', orderId);
    if (!p) throw new Error('no se emitió order.status_changed');
    expect(p.status).toBe('aceptado');
    expect(p.buyerId).toBe(LUCIA);
    expect(p.number).toBe(order.number);
  });

  it('envío → Mover/comprador: UPDATE status emite assigned y delivered', async () => {
    // order_id NULL para aislar los efectos del trigger de consumo de stock (entregado).
    const [ship] = await owner.db
      .insert(schema.shipments)
      .values({
        requesterId: CARLOS,
        communityId,
        moverId: PEDRO,
        status: 'solicitado',
      })
      .returning({ id: schema.shipments.id });
    if (!ship) throw new Error('no se creó el envío');
    shipmentId = ship.id;

    await owner.db
      .update(schema.shipments)
      .set({ status: 'asignado' })
      .where(eq(schema.shipments.id, shipmentId));
    const assigned = await outboxPayload(
      'shipment.assigned',
      'shipmentId',
      shipmentId,
    );
    if (!assigned) throw new Error('no se emitió shipment.assigned');
    expect(assigned.moverId).toBe(PEDRO);

    await owner.db
      .update(schema.shipments)
      .set({ status: 'entregado' })
      .where(eq(schema.shipments.id, shipmentId));
    const delivered = await outboxPayload(
      'shipment.delivered',
      'shipmentId',
      shipmentId,
    );
    expect(delivered).toBeDefined();
  });

  it('mensaje de chat → contraparte: INSERT message emite message.created', async () => {
    const [conv] = await owner.db
      .insert(schema.conversations)
      .values({ context: 'order', contextId: orderId })
      .returning({ id: schema.conversations.id });
    if (!conv) throw new Error('no se creó la conversación');
    conversationId = conv.id;

    await owner.db.insert(schema.messages).values({
      conversationId,
      senderId: LUCIA,
      body: 'Hola, ¿está disponible?',
    });

    const p = await outboxPayload(
      'message.created',
      'conversationId',
      conversationId,
    );
    if (!p) throw new Error('no se emitió message.created');
    expect(p.senderId).toBe(LUCIA);

    // Resolvers que usa el dispatch para armar los destinatarios.
    const ctx = await conversationContext(owner.db, conversationId);
    expect(ctx?.context).toBe('order');
    expect(ctx?.contextId).toBe(orderId);
    const brief = await orderBrief(owner.db, orderId);
    expect(brief?.buyerId).toBe(LUCIA);
    expect(brief?.storeId).toBe(FERRETERIA);
  });
});
