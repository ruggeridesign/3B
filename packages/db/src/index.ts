// Re-exporta operadores de Drizzle para garantizar UNA sola instancia en el
// workspace (evita choques de tipos entre variantes de peers).
export { and, eq, inArray, or, sql } from 'drizzle-orm';
export { createDb, type Database } from './client';
export {
  type AppContext,
  type AppDatabase,
  type AppDb,
  type AppTransaction,
  createAppDb,
  withAppContext,
} from './context';
export * as schema from './schema';
