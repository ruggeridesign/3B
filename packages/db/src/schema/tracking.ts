import {
  customType,
  index,
  integer,
  numeric,
  pgSchema,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { shipments } from './shipping';

// Esquema `tracking`: rastreo en vivo de los envíos (M6c). La posición es un
// `geography(Point,4326)` (PostGIS); la tabla va **particionada por mes** (D-08).
export const tracking = pgSchema('tracking');

/** Punto geográfico PostGIS. Drizzle no lo modela nativo → tipo custom (la DDL
 * real, con el particionado y el índice GIST, va a mano en la migración). */
const geographyPoint = customType<{ data: string }>({
  dataType() {
    return 'geography(Point,4326)';
  },
});

/**
 * Ping de posición de un envío (solo inserción). `point` es la coordenada; la app
 * inserta/lee por SQL crudo (`ST_MakePoint`/`ST_X`/`ST_Y`). **Particionada por mes**
 * sobre `recorded_at` (D-08), con índice GIST sobre `point`. Este objeto Drizzle es
 * para el query builder; la DDL particionada se escribe a mano en la migración. La
 * RLS deriva de la visibilidad del envío; la escribe solo el Mover asignado.
 */
export const locationPings = tracking.table(
  'location_pings',
  {
    shipmentId: uuid('shipment_id')
      .notNull()
      .references(() => shipments.id, { onDelete: 'cascade' }),
    point: geographyPoint('point').notNull(),
    speed: numeric('speed', { precision: 6, scale: 2 }),
    heading: integer('heading'),
    recordedAt: timestamp('recorded_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('location_pings_shipment_idx').on(t.shipmentId, t.recordedAt)],
);
