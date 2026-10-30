import type { AppTransaction } from '@3b/db';

/**
 * Variables de contexto que el middleware de la API fija por request:
 * - `userId`: usuario autenticado (null si no hay sesión).
 * - `db`: Drizzle ligado a la transacción con contexto RLS (null si no hay sesión).
 * - `isPlatformAdmin`: capacidad global derivada de la DB.
 *
 * Los routers de los módulos consumen estas variables; nunca leen la sesión
 * cruda ni confían en datos del cliente.
 */
export interface ApiVariables {
  userId: string | null;
  db: AppTransaction | null;
  isPlatformAdmin: boolean;
}
