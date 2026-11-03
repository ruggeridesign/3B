// API pública del módulo shipping.

export { shippingRouter } from './http/routes';
export {
  type CreateShipmentResult,
  createShipment,
  getShipment,
  getShipmentByOrder,
  listOpenShipments,
  listShipmentOffers,
  type MakeOfferResult,
  makeOffer,
} from './infra/shipping-repo';
