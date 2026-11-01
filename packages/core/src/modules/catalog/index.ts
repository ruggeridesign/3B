// API pública del módulo catalog.

export {
  type DiscoveryRouterOptions,
  discoveryRouter,
} from './http/discovery-routes';
export { catalogRouter } from './http/routes';
export {
  createGlobalAttribute,
  createStoreAttribute,
  deleteAttribute,
  listStoreAttributes,
  resolveAttributes,
} from './infra/attribute-repo';
export {
  createCategory,
  getCategory,
  listCategories,
} from './infra/category-repo';
export {
  addCollectionItem,
  createCollection,
  deleteCollection,
  getCollection,
  listCollections,
  removeCollectionItem,
  updateCollection,
} from './infra/collection-repo';
export { getPublicItem, searchItems } from './infra/discovery-repo';
export {
  createItem,
  deleteItem,
  getItem,
  getItemStore,
  listItemsByStore,
  updateItem,
} from './infra/item-repo';
export {
  deleteServiceDetail,
  getServiceDetail,
  upsertServiceDetail,
} from './infra/service-detail-repo';
export {
  createVariant,
  deleteVariant,
  listVariants,
  updateVariant,
} from './infra/variant-repo';
