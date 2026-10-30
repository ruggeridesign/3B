import { loadEnv } from '@3b/config';
import postgres from 'postgres';

// Reinicio de desarrollo: elimina los esquemas de la app y el meta de Drizzle.
// Luego el script `reset` del package vuelve a migrar y sembrar.
async function main() {
  const env = loadEnv();
  const sql = postgres(env.DATABASE_URL, { max: 1 });
  await sql.unsafe(
    'DROP SCHEMA IF EXISTS store CASCADE;' +
      'DROP SCHEMA IF EXISTS community CASCADE;' +
      'DROP SCHEMA IF EXISTS identity CASCADE;' +
      'DROP SCHEMA IF EXISTS platform CASCADE;' +
      'DROP SCHEMA IF EXISTS authz CASCADE;' +
      'DROP SCHEMA IF EXISTS drizzle CASCADE;',
  );
  console.log(
    '[reset] esquemas eliminados (store, community, identity, platform, authz, drizzle)',
  );
  await sql.end();
}

main().catch((err) => {
  console.error('[reset] error:', err);
  process.exit(1);
});
