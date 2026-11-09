import type { PushPayload } from '@3b/contracts';
import type { AppDatabase, AppTransaction } from '@3b/db';
import type { VapidConfig } from '../infra/push-sender';
import {
  conversationContext,
  orderBrief,
  storeMemberIds,
} from '../infra/recipients-repo';
import { notifyUser } from './notify-user';

type Db = AppDatabase | AppTransaction;

/** Evento del outbox (forma mínima; estructural con `platform.OutboxEvent`). */
export type NotifiableEvent = { topic: string; payload: unknown };

/** Envía `payload` a una lista de usuarios (deduplicada); devuelve cuántos recibieron. */
async function notifyAll(
  db: Db,
  userIds: Iterable<string>,
  payload: PushPayload,
  vapid: VapidConfig,
): Promise<number> {
  let sent = 0;
  for (const userId of new Set(userIds)) {
    const r = await notifyUser(db, userId, payload, vapid);
    sent += r.sent;
  }
  return sent;
}

/** Texto del aviso al comprador según el estado del pedido (null = no se notifica). */
function orderStatusMessage(
  status: string,
  number: number,
): { title: string; body: string } | null {
  switch (status) {
    case 'aceptado':
      return {
        title: 'Pedido aceptado',
        body: `Tu pedido #${number} fue aceptado.`,
      };
    case 'rechazado':
      return {
        title: 'Pedido rechazado',
        body: `Tu pedido #${number} fue rechazado.`,
      };
    case 'pago_confirmado':
      return {
        title: 'Pago confirmado',
        body: `Confirmaron el pago de tu pedido #${number}.`,
      };
    case 'pago_rechazado':
      return {
        title: 'Pago rechazado',
        body: `Rechazaron el pago de tu pedido #${number}.`,
      };
    case 'listo':
      return {
        title: 'Pedido listo',
        body: `Tu pedido #${number} está listo.`,
      };
    default:
      return null;
  }
}

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
  const payload = event.payload as Record<string, unknown>;

  switch (event.topic) {
    case 'order.placed': {
      const orderId = payload.orderId as string | undefined;
      const storeId = payload.storeId as string | undefined;
      const number = payload.number as number | undefined;
      if (!orderId || !storeId) return 0;
      const recipients = await storeMemberIds(db, storeId);
      return notifyAll(
        db,
        recipients,
        {
          title: 'Nuevo pedido',
          body: `Recibiste el pedido #${number}.`,
          url: `/mi-tienda/${storeId}`,
          tag: `order-${orderId}`,
        },
        vapid,
      );
    }

    case 'order.status_changed': {
      const orderId = payload.orderId as string | undefined;
      const buyerId = payload.buyerId as string | undefined;
      const status = payload.status as string | undefined;
      const number = payload.number as number | undefined;
      if (!orderId || !buyerId || !status || number === undefined) return 0;
      const msg = orderStatusMessage(status, number);
      if (!msg) return 0;
      return notifyAll(
        db,
        [buyerId],
        { ...msg, url: `/comprar/pedidos/${orderId}`, tag: `order-${orderId}` },
        vapid,
      );
    }

    case 'shipment.assigned': {
      const moverId = payload.moverId as string | undefined;
      const orderId = payload.orderId as string | undefined;
      const order = orderId ? await orderBrief(db, orderId) : null;
      let sent = 0;
      if (moverId) {
        sent += await notifyAll(
          db,
          [moverId],
          {
            title: 'Oferta aceptada',
            body: 'Te asignaron un envío.',
            url: '/mover',
          },
          vapid,
        );
      }
      if (order && orderId) {
        sent += await notifyAll(
          db,
          [order.buyerId],
          {
            title: 'Envío asignado',
            body: `Un Mover tomó el envío de tu pedido #${order.number}.`,
            url: `/comprar/pedidos/${orderId}`,
            tag: `order-${orderId}`,
          },
          vapid,
        );
      }
      return sent;
    }

    case 'shipment.delivered': {
      const orderId = payload.orderId as string | undefined;
      const order = orderId ? await orderBrief(db, orderId) : null;
      if (!order || !orderId) return 0;
      return notifyAll(
        db,
        [order.buyerId],
        {
          title: 'Pedido entregado',
          body: `Tu pedido #${order.number} fue entregado.`,
          url: `/comprar/pedidos/${orderId}`,
          tag: `order-${orderId}`,
        },
        vapid,
      );
    }

    case 'message.created': {
      const conversationId = payload.conversationId as string | undefined;
      const senderId = payload.senderId as string | undefined;
      if (!conversationId || !senderId) return 0;
      const ctx = await conversationContext(db, conversationId);
      if (!ctx || ctx.context !== 'order') return 0;
      const order = await orderBrief(db, ctx.contextId);
      if (!order) return 0;
      const members = await storeMemberIds(db, order.storeId);
      // Destinatarios = comprador + miembros de la tienda, menos el remitente.
      const recipients = [order.buyerId, ...members].filter(
        (id) => id !== senderId,
      );
      return notifyAll(
        db,
        recipients,
        {
          title: 'Nuevo mensaje',
          body: `Tenés un mensaje en el pedido #${order.number}.`,
          url: `/comprar/pedidos/${ctx.contextId}`,
          tag: `chat-${ctx.contextId}`,
        },
        vapid,
      );
    }

    default:
      return 0;
  }
}
