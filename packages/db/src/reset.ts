import { loadEnv } from '@3b/config';
import postgres from 'postgres';

// Reinicio de desarrollo: elimina los esquemas de la app y el meta de Drizzle.
// Luego el script `reset` del package vuelve a migrar y sembrar.
async function main() {
  const env = loadEnv();
  const sql = postgres(env.DATABASE_URL, { max: 1 });
  // Nota: al agregar un esquema nuevo (pgSchema) hay que sumarlo acá, o el
  // `CREATE SCHEMA` de su migración choca en el siguiente reset.
  const schemas = [
    'orders',
    'inventory',
    'catalog',
    'store',
    'community',
    'identity',
    'media',
    'platform',
    'authz',
    'drizzle',
  ];
  await sql.unsafe(
    schemas.map((s) => `DROP SCHEMA IF EXISTS ${s} CASCADE;`).join(''),
  );
  console.log(`[reset] esquemas eliminados (${schemas.join(', ')})`);
  await sql.end();
}

main().catch((err) => {
  console.error('[reset] error:', err);
  process.exit(1);
});
