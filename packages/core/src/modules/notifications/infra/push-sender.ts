import type { PushPayload } from '@3b/contracts';
// `web-push` v4 es ESM puro: expone named exports (sin `default`). Un namespace
// import es lo correcto en runtime ESM (el default import crashea bajo Node/tsx).
import * as webpush from 'web-push';
import type { StoredSubscription } from './subscription-repo';

/** Credenciales VAPID para firmar los envíos (de env; las inyecta apps/api/worker). */
export type VapidConfig = {
  publicKey: string;
  privateKey: string;
  subject: string;
};

/** Resultado de un envío: ok, `gone` (endpoint muerto → purgar), o error. */
export type SendResult =
  | { status: 'ok' }
  | { status: 'gone' }
  | { status: 'error'; code: number | null };

/**
 * Envía UN push a una suscripción, firmado con VAPID. No lanza: mapea el error a un
 * resultado. Un 404/410 significa que el navegador canceló la suscripción y hay que
 * purgarla de la base.
 */
export async function sendPush(
  sub: StoredSubscription,
  payload: PushPayload,
  vapid: VapidConfig,
): Promise<SendResult> {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
      {
        vapidDetails: {
          subject: vapid.subject,
          publicKey: vapid.publicKey,
          privateKey: vapid.privateKey,
        },
        TTL: 60 * 60, // 1 h
      },
    );
    return { status: 'ok' };
  } catch (err) {
    const code =
      err && typeof err === 'object' && 'statusCode' in err
        ? ((err as { statusCode?: number }).statusCode ?? null)
        : null;
    if (code === 404 || code === 410) return { status: 'gone' };
    return { status: 'error', code };
  }
}
