import { sql as sqlExpr } from 'drizzle-orm';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';
import * as schema from './schema';

export interface AppContext {
  /** Usuario autenticado (lo fija el servidor tras el login, nunca el cliente). */
  userId: string;
  /** Comunidad activa (opcional). */
  communityId?: string | null;
}

export type AppDatabase = PostgresJsDatabase<typeof schema>;
export type AppTransaction = Parameters<
  Parameters<AppDatabase['transaction']>[0]
>[0];

export interface AppDb {
  db: AppDatabase;
  client: Sql;
}

/**
 * Crea un Drizzle con el rol de aplicación (`app`, mínimo privilegio, sujeto a
 * RLS). Devuelve también el cliente para poder cerrarlo. Las migraciones/seed
 * usan el owner, no esta conexión.
 */
export function createAppDb(connectionString: string): AppDb {
  const client = postgres(connectionString, { max: 5 });
  return { db: drizzle(client, { schema }), client };
}

/**
 * Ejecuta `fn` dentro de UNA transacción con el contexto fijado vía
 * `SET LOCAL` (`set_config(..., true)`), que se limpia automáticamente al
 * cerrar la transacción. Todas las consultas que `fn` haga con `tx` quedan
 * sujetas a RLS con ese contexto.
 */
export async function withAppContext<T>(
  db: AppDatabase,
  ctx: AppContext,
  fn: (tx: AppTransaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sqlExpr`select set_config('app.user_id', ${ctx.userId}, true)`,
    );
    await tx.execute(
      sqlExpr`select set_config('app.community_id', ${ctx.communityId ?? ''}, true)`,
    );
    return fn(tx);
  });
}
