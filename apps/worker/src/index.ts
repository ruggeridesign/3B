import { loadEnv } from '@3b/config';
import { sweepExpiredReservations } from '@3b/core/modules/inventory';
import { drainOutbox, type OutboxEvent } from '@3b/core/modules/platform';
import { createAppDb } from '@3b/db';
import Redis from 'ioredis';

/**
 * Worker de 3B. Dos trabajos periódicos, ambos **jobs de sistema** (sin contexto
 * de usuario), por eso usan la conexión **owner**:
 *  - **Vencimiento de reservas (I-5):** barre las reservas `active` con
 *    `expires_at` vencido, las libera y deja `stock.changed` en el outbox.
 *  - **Publisher del outbox:** drena `platform.outbox` y publica cada evento en
 *    Valkey (pub/sub), marcándolos como publicados (at-least-once).
 */

const env = loadEnv();
const { db, client } = createAppDb(env.DATABASE_URL);
const valkey = new Redis(env.VALKEY_URL);

valkey.on('error', (e) => console.error('[worker] valkey:', e.message));

async function publish(event: OutboxEvent): Promise<void> {
  await valkey.publish(event.topic, JSON.stringify(event.payload));
}

/** Programa `fn` cada `intervalMs` sin solapar ejecuciones. Devuelve un `stop`. */
function loop(fn: () => Promise<void>, intervalMs: number): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let active = true;
  const tick = async () => {
    if (!active) return;
    try {
      await fn();
    } catch (e) {
      console.error('[worker] error:', e);
    }
    if (active) timer = setTimeout(tick, intervalMs);
  };
  void tick();
  return () => {
    active = false;
    if (timer) clearTimeout(timer);
  };
}

console.log('[worker] arrancando (sweep + outbox→valkey)…');

const stopSweep = loop(async () => {
  const res = await sweepExpiredReservations(db);
  if (res.released > 0) {
    console.log(`[worker] reservas vencidas liberadas: ${res.released}`);
  }
}, env.WORKER_SWEEP_INTERVAL_MS);

const stopDrain = loop(async () => {
  const n = await drainOutbox(db, publish);
  if (n > 0) console.log(`[worker] eventos publicados: ${n}`);
}, env.WORKER_OUTBOX_INTERVAL_MS);

async function shutdown(signal: string): Promise<void> {
  console.log(`[worker] ${signal} → cerrando…`);
  stopSweep();
  stopDrain();
  valkey.disconnect();
  await client.end();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
