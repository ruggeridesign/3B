import { randomInt } from 'node:crypto';
import type {
  CreateOfferInput,
  CreateShipmentInput,
  Shipment,
  ShipmentOffer,
} from '@3b/contracts';
import { type AppTransaction, and, desc, eq, ne, schema, sql } from '@3b/db';
import { getOrder, transitionOrder } from '../../orders';

type ShipmentRow = typeof schema.shipments.$inferSelect;
type OfferRow = typeof schema.shipmentOffers.$inferSelect;

/** Vence a los 10 min (S-1). El barrido automático lo hará el worker (M6b+). */
const OFFER_TTL_MIN = 10;

function toOffer(row: OfferRow, moverName: string | null): ShipmentOffer {
  return {
    id: row.id,
    shipmentId: row.shipmentId,
    moverId: row.moverId,
    moverName,
    price: row.price,
    etaMin: row.etaMin,
    status: row.status as ShipmentOffer['status'],
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

function toShipment(row: ShipmentRow, offers?: ShipmentOffer[]): Shipment {
  return {
    id: row.id,
    orderId: row.orderId,
    requesterId: row.requesterId,
    moverId: row.moverId,
    communityId: row.communityId,
    storeId: row.storeId,
    status: row.status as Shipment['status'],
    packageNote: row.packageNote,
    originRef: row.originRef,
    destRef: row.destRef,
    agreedPrice: row.agreedPrice,
    createdAt: row.createdAt.toISOString(),
    ...(offers ? { offers } : {}),
  };
}

/** Ofertas de un envío con el nombre del Mover (la RLS acota la visibilidad). */
export async function listShipmentOffers(
  db: AppTransaction,
  shipmentId: string,
): Promise<ShipmentOffer[]> {
  const rows = await db
    .select({ offer: schema.shipmentOffers, moverName: schema.users.name })
    .from(schema.shipmentOffers)
    .leftJoin(schema.users, eq(schema.users.id, schema.shipmentOffers.moverId))
    .where(eq(schema.shipmentOffers.shipmentId, shipmentId))
    .orderBy(desc(schema.shipmentOffers.createdAt));
  return rows.map((r) => toOffer(r.offer, r.moverName));
}

/** Ensambla un envío (cabecera + ofertas) por id, o null si no es visible. */
export async function getShipment(
  db: AppTransaction,
  id: string,
): Promise<Shipment | null> {
  const [row] = await db
    .select()
    .from(schema.shipments)
    .where(eq(schema.shipments.id, id))
    .limit(1);
  if (!row) return null;
  const offers = await listShipmentOffers(db, id);
  return toShipment(row, offers);
}

/** El envío (activo) de un pedido, con sus ofertas. null si no hay o no es visible. */
export async function getShipmentByOrder(
  db: AppTransaction,
  orderId: string,
): Promise<Shipment | null> {
  const [row] = await db
    .select()
    .from(schema.shipments)
    .where(
      and(
        eq(schema.shipments.orderId, orderId),
        ne(schema.shipments.status, 'cancelado'),
      ),
    )
    .orderBy(desc(schema.shipments.createdAt))
    .limit(1);
  if (!row) return null;
  const offers = await listShipmentOffers(db, row.id);
  return toShipment(row, offers);
}

/**
 * Solicitudes **abiertas** visibles para el usuario. Para un Mover aprobado, la
 * RLS deja ver las de las comunidades donde opera; acá se filtran a `solicitado`/
 * `ofertado` (aún tomables), recientes primero. Sin ofertas embebidas.
 */
export async function listOpenShipments(
  db: AppTransaction,
): Promise<Shipment[]> {
  const rows = await db
    .select()
    .from(schema.shipments)
    .where(
      and(
        ne(schema.shipments.status, 'cancelado'),
        ne(schema.shipments.status, 'fallido'),
      ),
    )
    .orderBy(desc(schema.shipments.createdAt));
  return rows
    .filter((r) => r.status === 'solicitado' || r.status === 'ofertado')
    .map((r) => toShipment(r));
}

/** Resultado de crear un envío (para mapear a HTTP sin 500). */
export type CreateShipmentResult =
  | { status: 'ok'; shipment: Shipment }
  | { status: 'order_not_found' }
  | { status: 'not_delivery' }
  | { status: 'already_requested' };

/**
 * El Seller solicita un envío para un pedido `delivery`. Deriva comunidad/tienda
 * del pedido y arma origen (tienda) / destino (dirección del pedido). Una solicitud
 * activa por pedido. La RLS es el candado: el solicitante debe ser miembro de la
 * tienda del pedido.
 */
export async function createShipment(
  db: AppTransaction,
  requesterId: string,
  input: CreateShipmentInput,
): Promise<CreateShipmentResult> {
  const order = await getOrder(db, input.orderId);
  if (!order) return { status: 'order_not_found' };
  if (order.fulfillment !== 'delivery') return { status: 'not_delivery' };

  const [existing] = await db
    .select({ id: schema.shipments.id })
    .from(schema.shipments)
    .where(
      and(
        eq(schema.shipments.orderId, order.id),
        ne(schema.shipments.status, 'cancelado'),
        ne(schema.shipments.status, 'fallido'),
      ),
    )
    .limit(1);
  if (existing) return { status: 'already_requested' };

  const [row] = await db
    .insert(schema.shipments)
    .values({
      orderId: order.id,
      requesterId,
      communityId: order.communityId,
      storeId: order.storeId,
      status: 'solicitado',
      packageNote: input.packageNote ?? null,
      originRef: order.storeName,
      destRef: order.addressSnapshot?.line1 ?? 'A convenir',
    })
    .returning();
  return { status: 'ok', shipment: toShipment(row as ShipmentRow) };
}

/** Resultado de ofertar (para mapear a HTTP sin 500). */
export type MakeOfferResult =
  | { status: 'ok'; offer: ShipmentOffer }
  | { status: 'shipment_not_found' }
  | { status: 'closed' }
  | { status: 'duplicate' };

/**
 * Un Mover aprobado oferta sobre un envío abierto (precio + ETA). Vence a los 10
 * min (S-1). Una oferta por `(envío, Mover)`. Al insertarla, un trigger mueve el
 * envío a `ofertado`. La RLS es el candado (Mover aprobado que opera en la
 * comunidad del envío); acá se pre-chequea para errores limpios.
 */
export async function makeOffer(
  db: AppTransaction,
  shipmentId: string,
  moverId: string,
  input: CreateOfferInput,
): Promise<MakeOfferResult> {
  const [ship] = await db
    .select({ id: schema.shipments.id, status: schema.shipments.status })
    .from(schema.shipments)
    .where(eq(schema.shipments.id, shipmentId))
    .limit(1);
  if (!ship) return { status: 'shipment_not_found' };
  if (ship.status !== 'solicitado' && ship.status !== 'ofertado') {
    return { status: 'closed' };
  }

  const [dup] = await db
    .select({ id: schema.shipmentOffers.id })
    .from(schema.shipmentOffers)
    .where(
      and(
        eq(schema.shipmentOffers.shipmentId, shipmentId),
        eq(schema.shipmentOffers.moverId, moverId),
      ),
    )
    .limit(1);
  if (dup) return { status: 'duplicate' };

  const expiresAt = new Date(Date.now() + OFFER_TTL_MIN * 60_000);
  const [row] = await db
    .insert(schema.shipmentOffers)
    .values({
      shipmentId,
      moverId,
      price: input.price,
      etaMin: input.etaMin,
      status: 'active',
      expiresAt,
    })
    .returning();

  const [me] = await db
    .select({ name: schema.users.name })
    .from(schema.users)
    .where(eq(schema.users.id, moverId))
    .limit(1);
  return { status: 'ok', offer: toOffer(row as OfferRow, me?.name ?? null) };
}

/** Envíos asignados a un Mover (sus viajes). La RLS acota a `mover_id = me`. */
export async function listMoverShipments(
  db: AppTransaction,
  moverId: string,
): Promise<Shipment[]> {
  const rows = await db
    .select()
    .from(schema.shipments)
    .where(eq(schema.shipments.moverId, moverId))
    .orderBy(desc(schema.shipments.createdAt));
  return rows.map((r) => toShipment(r));
}

/** Resultado de aceptar una oferta (para mapear a HTTP sin 500). */
export type AcceptOfferResult =
  | { status: 'ok'; shipment: Shipment; pin: string }
  | { status: 'shipment_not_found' }
  | { status: 'not_open' }
  | { status: 'offer_not_found' }
  | { status: 'order_not_ready'; current: string };

/**
 * El solicitante **acepta una oferta** (M6b): el envío queda `asignado` con el
 * Mover y el precio pactado, se **genera un PIN** y se guarda su **hash** (S-2,
 * `crypt`/`gen_salt` de pgcrypto), se **rechazan** las demás ofertas activas, y el
 * pedido pasa `listo → en_envio` (vía la API de `orders`). Exige el pedido en
 * `listo` (el envío = Mover asignado, §6). Devuelve el PIN en claro **una vez** (no
 * se persiste en claro). La RLS es el candado (solicitante o miembro de la tienda).
 */
export async function acceptOffer(
  db: AppTransaction,
  shipmentId: string,
  offerId: string,
  requesterId: string,
): Promise<AcceptOfferResult> {
  const [ship] = await db
    .select()
    .from(schema.shipments)
    .where(eq(schema.shipments.id, shipmentId))
    .limit(1);
  if (!ship) return { status: 'shipment_not_found' };
  if (ship.status !== 'ofertado') return { status: 'not_open' };

  const [offer] = await db
    .select()
    .from(schema.shipmentOffers)
    .where(
      and(
        eq(schema.shipmentOffers.id, offerId),
        eq(schema.shipmentOffers.shipmentId, shipmentId),
      ),
    )
    .limit(1);
  if (!offer || offer.status !== 'active') return { status: 'offer_not_found' };

  if (ship.orderId) {
    const order = await getOrder(db, ship.orderId);
    if (order && order.status !== 'listo') {
      return { status: 'order_not_ready', current: order.status };
    }
  }

  const pin = String(randomInt(0, 1_000_000)).padStart(6, '0');

  await db
    .update(schema.shipments)
    .set({
      status: 'asignado',
      moverId: offer.moverId,
      agreedPrice: offer.price,
      pinHash: sql`crypt(${pin}, gen_salt('bf'))`,
      updatedAt: new Date(),
    })
    .where(eq(schema.shipments.id, shipmentId));

  // Aceptar esta oferta; rechazar el resto (las que siguen `active`).
  await db
    .update(schema.shipmentOffers)
    .set({ status: 'accepted', updatedAt: new Date() })
    .where(eq(schema.shipmentOffers.id, offerId));
  await db
    .update(schema.shipmentOffers)
    .set({ status: 'rejected', updatedAt: new Date() })
    .where(
      and(
        eq(schema.shipmentOffers.shipmentId, shipmentId),
        eq(schema.shipmentOffers.status, 'active'),
      ),
    );

  if (ship.orderId) {
    await transitionOrder(
      db,
      ship.orderId,
      requesterId,
      'en_envio',
      'Mover asignado.',
    );
  }

  const full = await getShipment(db, shipmentId);
  return { status: 'ok', shipment: full as Shipment, pin };
}
