// API pública del módulo shipping.

export { shippingRouter } from './http/routes';
export {
  type AcceptOfferResult,
  acceptOffer,
  type CreateShipmentResult,
  createShipment,
  getShipment,
  getShipmentByOrder,
  listMoverShipments,
  listOpenShipments,
  listShipmentOffers,
  type MakeOfferResult,
  makeOffer,
} from './infra/shipping-repo';
