// Superficie http compartida de @3b/core: tipos de contexto + guards de
// capacidad (middleware) + predicados de autorización por alcance/propiedad.
// Los routers de los módulos la consumen vía `../../../http`; apps/api importa
// `ApiVariables` vía `@3b/core/http`.

export {
  canManageStore,
  isCommunityAdmin,
  isCommunityMember,
  isMoverApproved,
  isPlatformAdmin,
  isStoreMember,
} from './authz';
export { type DbErrorResponse, dbErrorResponse, pgCode } from './errors';
export {
  realCtx,
  requirePlatformAdmin,
  requireRealPlatformAdmin,
  requireSession,
  sessionCtx,
} from './guards';
export type { ApiEnv, ApiVariables } from './types';
