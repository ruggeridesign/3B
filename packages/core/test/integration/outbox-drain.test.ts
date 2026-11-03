import { loadEnv } from '@3b/config';
import { and, createAppDb, eq, inArray, isNull, schema } from '@3b/db';
import { afterAll, describe, expect, it } from 'vitest';
import { drainOutbox, type OutboxEvent } from '../../src/modules/platform';

const env = loadEnv();
// El drenado es un job de sistema → conexión owner (bypassa RLS).
const owner = createAppDb(env.DATABASE_URL);

const TOPICS = ['test.outbox.a', 'test.outbox.b'];

afterAll(async () => {
  await owner.db
    .delete(schema.outbox)
    .where(inArray(schema.outbox.topic, TOPICS));
  await owner.client.end();
});

describe('outbox drain (worker publisher): publica y marca publicado', () => {
  it('publica los pendientes y los marca como publicados', async () => {
    await owner.db.insert(schema.outbox).values([
      { topic: TOPICS[0] as string, payload: { n: 1 } },
      { topic: TOPICS[1] as string, payload: { n: 2 } },
    ]);

    const seen: OutboxEvent[] = [];
    const n = await drainOutbox(owner.db, async (e) => {
      seen.push(e);
    });
    expect(n).toBeGreaterThanOrEqual(2);
    expect(seen.map((e) => e.topic)).toEqual(expect.arrayContaining(TOPICS));

    // Ya no quedan pendientes de esos topics.
    const pending = await owner.db
      .select()
      .from(schema.outbox)
      .where(
        and(
          inArray(schema.outbox.topic, TOPICS),
          isNull(schema.outbox.publishedAt),
        ),
      );
    expect(pending).toHaveLength(0);
  });

  it('es idempotente: un segundo drenado no republica lo ya publicado', async () => {
    const seen: string[] = [];
    await drainOutbox(owner.db, async (e) => {
      seen.push(e.topic);
    });
    expect(seen).not.toContain(TOPICS[0]);
    expect(seen).not.toContain(TOPICS[1]);
  });

  it('marca published_at en las filas publicadas', async () => {
    const rows = await owner.db
      .select({ publishedAt: schema.outbox.publishedAt })
      .from(schema.outbox)
      .where(eq(schema.outbox.topic, TOPICS[0] as string));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.publishedAt !== null)).toBe(true);
  });
});
