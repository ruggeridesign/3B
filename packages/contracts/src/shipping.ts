import { z } from 'zod';

/**
 * Contratos del módulo `shipping`. **M6a — solicitud + ofertas**: el Seller
 * solicita un envío para un pedido `delivery` (nace `solicitado`); los Movers
 * aprobados que operan en la comunidad **ofertan** (precio + ETA), lo que mueve el
 * envío a `ofertado`. La asignación + PIN (M6b) y el rastreo + entrega (M6c) llegan
 * después. La geolocalización (geography) se difiere a M6c (rastreo).
 */

const uuid = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const money = z.string().regex(/^\d{1,10}(\.\d{1,2})?$/);

/** Estados del envío (§6 del modelo de datos). */
export const ShipmentStatus = z.enum([
  'solicitado',
  'ofertado',
  'asignado',
  'hacia_retiro',
  'retirado',
  'en_transito',
  'entregado',
  'cancelado',
  'fallido',
]);
export type ShipmentStatus = z.infer<typeof ShipmentStatus>;

/** Estado de una oferta de Mover. */
export const OfferStatus = z.enum([
  'active',
  'accepted',
  'rejected',
  'expired',
]);
export type OfferStatus = z.infer<typeof OfferStatus>;

/** Una oferta de un Mover sobre un envío. */
export const ShipmentOffer = z.object({
  id: z.string(),
  shipmentId: z.string(),
  moverId: z.string(),
  moverName: z.string().nullable(),
  price: money,
  etaMin: z.number().int(),
  status: OfferStatus,
  expiresAt: z.string(),
  createdAt: z.string(),
});
export type ShipmentOffer = z.infer<typeof ShipmentOffer>;

/** Lista de ofertas de un envío. */
export const ShipmentOfferList = z.object({
  offers: z.array(ShipmentOffer),
});
export type ShipmentOfferList = z.infer<typeof ShipmentOfferList>;

/** Un envío (solicitud de traslado de un pedido). */
export const Shipment = z.object({
  id: z.string(),
  orderId: z.string().nullable(),
  requesterId: z.string(),
  moverId: z.string().nullable(),
  communityId: z.string(),
  storeId: z.string().nullable(),
  status: ShipmentStatus,
  packageNote: z.string().nullable(),
  originRef: z.string().nullable(),
  destRef: z.string().nullable(),
  agreedPrice: z.string().nullable(),
  createdAt: z.string(),
  offers: z.array(ShipmentOffer).optional(),
});
export type Shipment = z.infer<typeof Shipment>;

/** Lista de envíos (p. ej. las solicitudes abiertas para un Mover). */
export const ShipmentList = z.object({ shipments: z.array(Shipment) });
export type ShipmentList = z.infer<typeof ShipmentList>;

/** El Seller solicita un envío para un pedido `delivery`. */
export const CreateShipmentInput = z.object({
  orderId: uuid,
  packageNote: z.string().max(500).optional(),
});
export type CreateShipmentInput = z.infer<typeof CreateShipmentInput>;

/** Un Mover oferta: precio + ETA (minutos). Vence a los 10 min (S-1). */
export const CreateOfferInput = z.object({
  price: money,
  etaMin: z.number().int().positive().max(1440),
});
export type CreateOfferInput = z.infer<typeof CreateOfferInput>;
