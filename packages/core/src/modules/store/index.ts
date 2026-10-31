// API pública del módulo store.

export { storeRouter } from './http/routes';
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
