// API pública del módulo store.

export { type StoreRouterOptions, storeRouter } from './http/routes';
export {
  createPaymentMethod,
  deletePaymentMethod,
  getPaymentMethod,
  listPaymentMethods,
  updatePaymentMethod,
} from './infra/payment-repo';
export {
  addStoreMember,
  createStore,
  findUserIdByEmail,
  getStore,
  listMyStores,
  listStoreMembers,
  type MemberDeleteResult,
  type MemberUpdateResult,
  type NewStore,
  removeStoreMember,
  updateStoreMemberRole,
} from './infra/store-repo';
