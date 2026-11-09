import type { PushSubscriptionInput } from '@3b/contracts';
import { type AppDatabase, type AppTransaction, eq, schema } from '@3b/db';

/** Conexión con capacidad de consultar/mutar suscripciones (http: tx RLS; worker: owner). */
type Db = AppDatabase | AppTransaction;

/** Lo mínimo para enviar un push a una suscripción. */
export type StoredSubscription = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

/**
 * Upsert por `endpoint`: re-suscribir el mismo navegador actualiza sus claves y lo
 * reasigna al usuario actual (p. ej. si otra cuenta usó ese dispositivo).
 */
export async function upsertSubscription(
  db: Db,
  userId: string,
  input: PushSubscriptionInput,
  userAgent: string | null,
): Promise<void> {
  await db
    .insert(schema.pushSubscriptions)
    .values({
      userId,
      endpoint: input.endpoint,
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
      userAgent,
    })
    .onConflictDoUpdate({
      target: schema.pushSubscriptions.endpoint,
      set: {
        userId,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        userAgent,
        updatedAt: new Date(),
      },
    });
}

/** Baja por endpoint (la RLS acota a las del propio usuario). */
export async function deleteSubscription(
  db: Db,
  endpoint: string,
): Promise<void> {
  await db
    .delete(schema.pushSubscriptions)
    .where(eq(schema.pushSubscriptions.endpoint, endpoint));
}

/** Suscripciones de un usuario (para enviarle push). */
export async function listSubscriptionsForUser(
  db: Db,
  userId: string,
): Promise<StoredSubscription[]> {
  return db
    .select({
      endpoint: schema.pushSubscriptions.endpoint,
      p256dh: schema.pushSubscriptions.p256dh,
      auth: schema.pushSubscriptions.auth,
    })
    .from(schema.pushSubscriptions)
    .where(eq(schema.pushSubscriptions.userId, userId));
}
