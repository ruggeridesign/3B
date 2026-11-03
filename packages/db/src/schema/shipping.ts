import {
  index,
  integer,
  numeric,
  pgSchema,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { timestamps } from './_shared';
import { communities } from './community';
import { moverProfiles, users } from './identity';
import { mediaFiles } from './media';
import { orderRecords } from './orders';
import { stores } from './store';

// Esquema `shipping`: envíos (solicitudes), ofertas de Movers y tarifarios.
// M6a — solicitud + ofertas. La geolocalización (geography) llega con M6c.
export const shipping = pgSchema('shipping');

/**
 * Un envío: solicitud de traslado de un pedido. Nace `solicitado`; una oferta lo
 * pasa a `ofertado` (trigger). `community_id`/`store_id` se denormalizan del
 * pedido (RLS + alcance de ofertas). `pin_hash`/`proof_media_id` quedan previstos
 * (M6b/M6c). La RLS: lo ven el solicitante, el Mover asignado, la tienda y los
 * Movers aprobados que operan en la comunidad (para ofertar).
 */
export const shipments = shipping.table(
  'shipments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id').references(() => orderRecords.id, {
      onDelete: 'set null',
    }),
    requesterId: uuid('requester_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    moverId: uuid('mover_id').references(() => moverProfiles.userId, {
      onDelete: 'set null',
    }),
    communityId: uuid('community_id')
      .notNull()
      .references(() => communities.id, { onDelete: 'restrict' }),
    storeId: uuid('store_id').references(() => stores.id, {
      onDelete: 'set null',
    }),
    status: text('status').notNull().default('solicitado'),
    packageNote: text('package_note'),
    originRef: text('origin_ref'),
    destRef: text('dest_ref'),
    agreedPrice: numeric('agreed_price', { precision: 12, scale: 2 }),
    pinHash: text('pin_hash'),
    proofMediaId: uuid('proof_media_id').references(() => mediaFiles.id, {
      onDelete: 'set null',
    }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index('shipments_status_idx').on(t.status),
    index('shipments_community_idx').on(t.communityId),
    index('shipments_mover_idx').on(t.moverId),
    index('shipments_order_idx').on(t.orderId),
  ],
);

/**
 * Oferta de un Mover sobre un envío (precio + ETA). Vence a los 10 min (S-1). Una
 * por `(shipment, mover)`. Al insertarla, un trigger mueve el envío a `ofertado`.
 * La RLS: la ve el Mover que la hizo y el solicitante/tienda del envío; la crea un
 * Mover aprobado que opera en la comunidad del envío.
 */
export const shipmentOffers = shipping.table(
  'shipment_offers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    shipmentId: uuid('shipment_id')
      .notNull()
      .references(() => shipments.id, { onDelete: 'cascade' }),
    moverId: uuid('mover_id')
      .notNull()
      .references(() => moverProfiles.userId, { onDelete: 'cascade' }),
    price: numeric('price', { precision: 12, scale: 2 }).notNull(),
    etaMin: integer('eta_min').notNull(),
    status: text('status').notNull().default('active'), // active | accepted | rejected | expired
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (t) => [
    unique('shipment_offers_shipment_mover_unique').on(t.shipmentId, t.moverId),
    index('shipment_offers_shipment_idx').on(t.shipmentId),
  ],
);
