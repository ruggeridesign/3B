import { loadEnv } from '@3b/config';
import { createAppDb, eq, schema } from '@3b/db';
import { afterAll, describe, expect, it } from 'vitest';
import { storeMemberIds } from '../../src/modules/notifications';

// UUIDs del seed determinista.
const CARLOS = '22222222-2222-2222-2222-222222222203'; // miembro de la ferretería
const LUCIA = '22222222-2222-2222-2222-222222222206'; // comprador
const FERRETERIA = '33333333-3333-3333-3333-333333333301';

const env = loadEnv();
// Owner (como el worker): puede insertar el pedido y leer el outbox sin RLS.
const owner = createAppDb(env.DATABASE_URL);

let orderId = '';

afterAll(async () => {
  if (orderId) {
    await owner.db
      .delete(schema.orderRecords)
      .where(eq(schema.orderRecords.id, orderId));
  }
  await owner.client.end();
});

describe('notifications dispatch (M8d.2a): order.placed → tienda', () => {
  it('crear un pedido emite order.placed al outbox con los IDs correctos', async () => {
    const [store] = await owner.db
      .select({ communityId: schema.stores.communityId })
      .from(schema.stores)
      .where(eq(schema.stores.id, FERRETERIA));
    if (!store) throw new Error('store de prueba no encontrada');

    const [order] = await owner.db
      .insert(schema.orderRecords)
      .values({
        storeId: FERRETERIA,
        communityId: store.communityId,
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

    // El trigger AFTER INSERT dejó el evento. Lo buscamos por orderId: drainOutbox
    // no borra (solo marca published_at), así que es robusto ante drenados paralelos.
    const rows = await owner.db
      .select({ payload: schema.outbox.payload })
      .from(schema.outbox)
      .where(eq(schema.outbox.topic, 'order.placed'));
    const mine = rows.find(
      (r) => (r.payload as { orderId?: string }).orderId === orderId,
    );
    if (!mine) throw new Error('no se emitió order.placed');

    const p = mine.payload as {
      storeId: string;
      buyerId: string;
      number: number;
    };
    expect(p.storeId).toBe(FERRETERIA);
    expect(p.buyerId).toBe(LUCIA);
    expect(p.number).toBe(order.number);
  });

  it('resuelve los miembros de la tienda como destinatarios', async () => {
    const members = await storeMemberIds(owner.db, FERRETERIA);
    expect(members).toContain(CARLOS);
  });
});
