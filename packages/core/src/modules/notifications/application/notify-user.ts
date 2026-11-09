import type { PushPayload } from '@3b/contracts';
import type { AppDatabase, AppTransaction } from '@3b/db';
import { sendPush, type VapidConfig } from '../infra/push-sender';
import {
  deleteSubscription,
  listSubscriptionsForUser,
} from '../infra/subscription-repo';

/**
 * Envía un push a TODAS las suscripciones de un usuario y purga las muertas
 * (404/410). Devuelve cuántas recibieron y cuántas se purgaron. `db` debe poder ver
 * las suscripciones del usuario: el worker usa la conexión owner (M8d.2); en el
 * auto-test, el propio usuario bajo RLS ve las suyas.
 */
export async function notifyUser(
  db: AppDatabase | AppTransaction,
  userId: string,
  payload: PushPayload,
  vapid: VapidConfig,
): Promise<{ sent: number; pruned: number }> {
  const subs = await listSubscriptionsForUser(db, userId);
  let sent = 0;
  let pruned = 0;
  for (const sub of subs) {
    const res = await sendPush(sub, payload, vapid);
    if (res.status === 'ok') {
      sent += 1;
    } else if (res.status === 'gone') {
      await deleteSubscription(db, sub.endpoint);
      pruned += 1;
    }
  }
  return { sent, pruned };
}
