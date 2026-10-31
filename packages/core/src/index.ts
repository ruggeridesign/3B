// API pública de @3b/core. Re-exporta la superficie pública de cada módulo.
export type { ApiVariables } from './http';
export * as admin from './modules/admin';
export * as identity from './modules/identity';
export * as store from './modules/store';
export * as system from './modules/system';
