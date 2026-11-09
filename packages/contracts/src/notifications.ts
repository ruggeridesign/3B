import { z } from 'zod';

/**
 * Contratos del módulo `notifications`. **M8d — Web Push (VAPID)**: el navegador se
 * suscribe (endpoint + claves) y el servidor envía notificaciones firmadas con
 * VAPID. La forma de la suscripción espeja el `PushSubscription.toJSON()` del
 * navegador.
 */

/** Claves de cifrado de una suscripción de push (del `PushSubscription`). */
export const PushKeys = z.object({
  p256dh: z.string().min(1),
  auth: z.string().min(1),
});
export type PushKeys = z.infer<typeof PushKeys>;

/** Alta/actualización de una suscripción (upsert por `endpoint`). */
export const PushSubscriptionInput = z.object({
  endpoint: z.string().url(),
  keys: PushKeys,
});
export type PushSubscriptionInput = z.infer<typeof PushSubscriptionInput>;

/** Baja de una suscripción (por su endpoint). */
export const DeletePushSubscriptionInput = z.object({
  endpoint: z.string().url(),
});
export type DeletePushSubscriptionInput = z.infer<
  typeof DeletePushSubscriptionInput
>;

/** Clave pública VAPID que la web usa para suscribirse. */
export const VapidPublicKey = z.object({ publicKey: z.string().min(1) });
export type VapidPublicKey = z.infer<typeof VapidPublicKey>;

/**
 * Carga útil de una notificación push (lo que el service worker muestra). `url` es
 * a dónde navegar al tocarla; `tag` colapsa notificaciones del mismo hilo.
 */
export const PushPayload = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
  url: z.string().optional(),
  tag: z.string().optional(),
});
export type PushPayload = z.infer<typeof PushPayload>;
