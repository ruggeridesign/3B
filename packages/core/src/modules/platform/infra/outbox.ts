import { type AppDatabase, eq, isNull, schema } from '@3b/db';

/** Un evento del outbox listo para publicar. */
export type OutboxEvent = {
  id: string;
  topic: string;
  payload: unknown;
};

/** Publica un evento en el broker (lo inyecta el worker; p. ej. Valkey). */
export type PublishFn = (event: OutboxEvent) => Promise<void>;

/**
 * Drena el outbox: lee los eventos pendientes (`published_at IS NULL`, más
 * antiguos primero), los publica con `publish` y marca cada uno como publicado.
 * **At-least-once**: si `publish` falla, corta y reintenta en el próximo drenado;
 * si falla el marcado, el evento se re-publica (los consumidores deben ser
 * idempotentes). Corre con la conexión **owner** (job de sistema). Devuelve cuántos
 * publicó. `publish` se inyecta para poder testear sin broker.
 */
export async function drainOutbox(
  db: AppDatabase,
  publish: PublishFn,
  limit = 100,
): Promise<number> {
  const pending = await db
    .select({
      id: schema.outbox.id,
      topic: schema.outbox.topic,
      payload: schema.outbox.payload,
    })
    .from(schema.outbox)
    .where(isNull(schema.outbox.publishedAt))
    .orderBy(schema.outbox.createdAt)
    .limit(limit);

  for (const row of pending) {
    await publish({ id: row.id, topic: row.topic, payload: row.payload });
    await db
      .update(schema.outbox)
      .set({ publishedAt: new Date() })
      .where(eq(schema.outbox.id, row.id));
  }
  return pending.length;
}
