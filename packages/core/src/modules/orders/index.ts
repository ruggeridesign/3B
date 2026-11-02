// API pública del módulo orders.

export {
  computeTotals,
  fromCents,
  lineTotalCents,
  type OrderTotals,
  type PriceLine,
  toCents,
} from './domain/pricing';
export {
  canTransition,
  findTransition,
  nextStatuses,
  type StockEffect,
  stockEffect,
  transitionsFor,
} from './domain/transitions';
export { ordersRouter } from './http/routes';
export {
  type CreateResult,
  createOrder,
  freezeFxRate,
  getOrder,
  listMyOrders,
  listStoreOrders,
  type TransitionResult,
  transitionOrder,
} from './infra/order-repo';
