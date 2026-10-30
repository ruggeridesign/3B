import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

/**
 * Crea un cliente Drizzle tipado a partir de una cadena de conexión.
 * La inyecta quien lo use (apps/api vía @3b/config.loadEnv), nunca la capa domain.
 */
export function createDb(connectionString: string) {
  const sql = postgres(connectionString);
  return drizzle(sql, { schema });
}

export type Database = ReturnType<typeof createDb>;
