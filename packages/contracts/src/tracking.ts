import { z } from 'zod';

/**
 * Contratos del módulo `tracking`. **M6c.2 — rastreo en vivo**: el Mover asignado
 * postea pings de posición durante el viaje; el comprador/tienda ve la última
 * posición y el recorrido reciente. La posición es `geography(Point)` (PostGIS).
 */

/** Un ping de posición de un envío. */
export const LocationPing = z.object({
  shipmentId: z.string(),
  lat: z.number(),
  lng: z.number(),
  speed: z.number().nullable(),
  heading: z.number().int().nullable(),
  recordedAt: z.string(),
});
export type LocationPing = z.infer<typeof LocationPing>;

/** El Mover postea su posición actual. */
export const PostPingInput = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  speed: z.number().min(0).optional(),
  heading: z.number().int().min(0).max(359).optional(),
});
export type PostPingInput = z.infer<typeof PostPingInput>;

/** Rastreo de un envío: última posición + recorrido reciente (recientes primero). */
export const ShipmentTrack = z.object({
  latest: LocationPing.nullable(),
  track: z.array(LocationPing),
});
export type ShipmentTrack = z.infer<typeof ShipmentTrack>;
