import type { LocationPing, PostPingInput } from '@3b/contracts';
import { type AppTransaction, eq, schema, sql } from '@3b/db';

type PingRow = {
  shipment_id: string;
  lat: number | string;
  lng: number | string;
  speed: number | string | null;
  heading: number | null;
  recorded_at: string | Date;
};

function toPing(row: PingRow): LocationPing {
  return {
    shipmentId: String(row.shipment_id),
    lat: Number(row.lat),
    lng: Number(row.lng),
    speed: row.speed != null ? Number(row.speed) : null,
    heading: row.heading != null ? Number(row.heading) : null,
    recordedAt: new Date(row.recorded_at).toISOString(),
  };
}

/** Columnas del ping con lat/lng derivadas del `point` (PostGIS). */
const PING_COLS = sql`shipment_id,
  ST_Y(point::geometry) AS lat, ST_X(point::geometry) AS lng,
  speed, heading, recorded_at`;

/** Resultado de postear un ping (para mapear a HTTP sin 500). */
export type PostPingResult =
  | { status: 'ok'; ping: LocationPing }
  | { status: 'not_found' }
  | { status: 'not_assigned' }
  | { status: 'not_active' };

const ACTIVE = new Set(['asignado', 'hacia_retiro', 'retirado', 'en_transito']);

/**
 * El **Mover asignado** postea su posición durante un viaje activo. Inserta el
 * `point` con `ST_MakePoint(lng, lat)` (SQL crudo; Drizzle no modela geography). La
 * RLS es el candado (solo el Mover asignado inserta); acá se pre-chequea para
 * errores limpios y para exigir un viaje en curso.
 */
export async function postPing(
  db: AppTransaction,
  shipmentId: string,
  moverId: string,
  input: PostPingInput,
): Promise<PostPingResult> {
  const [ship] = await db
    .select({
      moverId: schema.shipments.moverId,
      status: schema.shipments.status,
    })
    .from(schema.shipments)
    .where(eq(schema.shipments.id, shipmentId))
    .limit(1);
  if (!ship) return { status: 'not_found' };
  if (ship.moverId !== moverId) return { status: 'not_assigned' };
  if (!ACTIVE.has(ship.status)) return { status: 'not_active' };

  const rows = (await db.execute(sql`
    INSERT INTO tracking.location_pings (shipment_id, point, speed, heading)
    VALUES (
      ${shipmentId},
      ST_SetSRID(ST_MakePoint(${input.lng}, ${input.lat}), 4326)::geography,
      ${input.speed ?? null}, ${input.heading ?? null}
    )
    RETURNING ${PING_COLS}
  `)) as unknown as PingRow[];
  return { status: 'ok', ping: toPing(rows[0] as PingRow) };
}

/** Última posición de un envío (la RLS acota la visibilidad). null si no hay. */
export async function latestPing(
  db: AppTransaction,
  shipmentId: string,
): Promise<LocationPing | null> {
  const rows = (await db.execute(sql`
    SELECT ${PING_COLS} FROM tracking.location_pings
    WHERE shipment_id = ${shipmentId}
    ORDER BY recorded_at DESC LIMIT 1
  `)) as unknown as PingRow[];
  return rows[0] ? toPing(rows[0]) : null;
}

/** Recorrido reciente de un envío (recientes primero, hasta `limit`). */
export async function recentTrack(
  db: AppTransaction,
  shipmentId: string,
  limit = 100,
): Promise<LocationPing[]> {
  const rows = (await db.execute(sql`
    SELECT ${PING_COLS} FROM tracking.location_pings
    WHERE shipment_id = ${shipmentId}
    ORDER BY recorded_at DESC LIMIT ${limit}
  `)) as unknown as PingRow[];
  return rows.map(toPing);
}
