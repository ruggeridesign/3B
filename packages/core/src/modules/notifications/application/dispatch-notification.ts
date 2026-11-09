import type { PushPayload } from '@3b/contracts';
import type { AppDatabase, AppTransaction } from '@3b/db';
import type { VapidConfig } from '../infra/push-sender';
import { storeMemberIds } from '../infra/recipients-repo';
import { notifyUser } from './notify-user';

type Db = AppDatabase | AppTransaction;

/** Evento del outbox (forma mínima; estructural con `platform.OutboxEvent`). */
export type NotifiableEvent = { topic: string; payload: unknown };

/**
 * Traduce un evento de dominio del outbox a notificaciones push: resuelve los
 * destinatarios, compone el texto y envía a cada uno (purgando suscripciones
 * muertas). Devuelve cuántos push se enviaron; para topics no notificables, 0. Lo
 * llama el **worker** (owner) tras drenar el outbox (M8d.2).
 */
export async function dispatchNotification(
  db: Db,
  vapid: VapidConfig,
  event: NotifiableEvent,
): Promise<number> {
  switch (event.topic) {
    case 'order.placed': {
      const p = event.payload as {
        orderId?: string;
        storeId?: string;
        number?: number;
      };
      if (!p.orderId || !p.storeId) return 0;
      const recipients = await storeMemberIds(db, p.storeId);
      const payload: PushPayload = {
        title: 'Nuevo pedido',
        body: `Recibiste el pedido #${p.number}.`,
        url: `/mi-tienda/${p.storeId}`,
        tag: `order-${p.orderId}`,
      };
      let sent = 0;
      for (const userId of recipients) {
        const r = await notifyUser(db, userId, payload, vapid);
        sent += r.sent;
      }
      return sent;
    }
    default:
      return 0;
  }
}
