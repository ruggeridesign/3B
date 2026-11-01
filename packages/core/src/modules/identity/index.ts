// API pública del módulo identity.

export { kycRouter } from './http/kyc-routes';
export { meRouter } from './http/routes';
export { readIsPlatformAdmin, readMe } from './infra/identity-reader';
