import type { LocationPing } from '@3b/contracts';
import Redis from 'ioredis';

/**
 * Rastreo en vivo (M6c.2b) sobre Valkey. Cada ping se **publica** en un canal por
 * envío (`shipment:<id>:ping`) y se registra su posición en un índice **GEO**
 * (`shipments:geo`, para proximidad). El WebSocket de `/ws/shipments/:id/track`
 * se suscribe al canal y reenvía los pings al navegador. Publicar es best-effort:
 * si Valkey no está, no debe tumbar el request (la fuente durable es la DB).
 */
export function createLive(valkeyUrl: string) {
  const pub = new Redis(valkeyUrl, { maxRetriesPerRequest: 2 });
  pub.on('error', (e) => console.error('[live] valkey pub:', e.message));

  const channel = (shipmentId: string) => `shipment:${shipmentId}:ping`;

  /** Publica un ping (canal + GEO). No lanza: errores de broker se tragan. */
  async function publishPing(
    shipmentId: string,
    ping: LocationPing,
  ): Promise<void> {
    try {
      await pub.geoadd('shipments:geo', ping.lng, ping.lat, shipmentId);
      await pub.publish(channel(shipmentId), JSON.stringify(ping));
    } catch (e) {
      console.error('[live] publish:', (e as Error).message);
    }
  }

  /** Un subscriber **dedicado** por conexión WS (ioredis no mezcla pub/sub). */
  function subscriber(): Redis {
    const sub = new Redis(valkeyUrl, { maxRetriesPerRequest: 2 });
    sub.on('error', (e) => console.error('[live] valkey sub:', e.message));
    return sub;
  }

  async function close(): Promise<void> {
    pub.disconnect();
  }

  return { publishPing, channel, subscriber, close };
}
