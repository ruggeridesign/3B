// API pública del módulo shipping.

export { shippingRouter } from './http/routes';
export {
  type AcceptOfferResult,
  acceptOffer,
  type CreateShipmentResult,
  createShipment,
  deliverShipment,
  getShipment,
  getShipmentByOrder,
  listMoverShipments,
  listOpenShipments,
  listShipmentOffers,
  type MakeOfferResult,
  makeOffer,
  progressShipment,
  type TripResult,
} from './infra/shipping-repo';
