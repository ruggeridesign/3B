import { loadEnv } from '@3b/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

// Seed DETERMINISTA: UUIDs y datos fijos, idempotente (onConflictDoNothing).
// Cubre varias comunidades, usuarios con distintos niveles de permiso y tiendas.

// --- Comunidades ---
const CORO = '11111111-1111-1111-1111-111111111101';
const PUNTO_FIJO = '11111111-1111-1111-1111-111111111102';
const SANTA_ANA = '11111111-1111-1111-1111-111111111103';
const VILLA_SOL = '11111111-1111-1111-1111-111111111104'; // privada (gated)

// --- Usuarios ---
const U_ADMIN = '22222222-2222-2222-2222-222222222201'; // admin de plataforma (global)
const U_ANA = '22222222-2222-2222-2222-222222222202'; // admin de comunidad (Coro)
const U_CARLOS = '22222222-2222-2222-2222-222222222203'; // Seller (dueño de tiendas)
const U_MARTA = '22222222-2222-2222-2222-222222222204'; // Seller staff (sales)
const U_PEDRO = '22222222-2222-2222-2222-222222222205'; // Mover
const U_LUCIA = '22222222-2222-2222-2222-222222222206'; // Maker a secas

// --- Tiendas ---
const S_FERRETERIA = '33333333-3333-3333-3333-333333333301'; // productos, Coro
const S_PELUQUERIA = '33333333-3333-3333-3333-333333333302'; // servicios, Punto Fijo

async function main() {
  const env = loadEnv();
  const sql = postgres(env.DATABASE_URL, { max: 1 });
  const db = drizzle(sql, { schema });

  await db
    .insert(schema.communities)
    .values([
      {
        id: CORO,
        slug: 'coro',
        name: 'Coro',
        type: 'town',
        visibility: 'public',
      },
      {
        id: PUNTO_FIJO,
        slug: 'punto-fijo',
        name: 'Punto Fijo',
        type: 'town',
        visibility: 'public',
      },
      {
        id: SANTA_ANA,
        slug: 'santa-ana',
        name: 'Santa Ana',
        type: 'town',
        visibility: 'public',
      },
      {
        id: VILLA_SOL,
        slug: 'villa-del-sol',
        name: 'Villa del Sol',
        type: 'gated',
        visibility: 'private',
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(schema.users)
    .values([
      {
        id: U_ADMIN,
        email: 'admin@3b.test',
        name: 'Admin Plataforma',
        emailVerified: true,
        isPlatformAdmin: true,
        defaultCommunityId: CORO,
      },
      {
        id: U_ANA,
        email: 'ana@3b.test',
        name: 'Ana (admin Coro)',
        emailVerified: true,
        defaultCommunityId: CORO,
      },
      {
        id: U_CARLOS,
        email: 'carlos@3b.test',
        name: 'Carlos (Seller)',
        emailVerified: true,
        defaultCommunityId: CORO,
      },
      {
        id: U_MARTA,
        email: 'marta@3b.test',
        name: 'Marta (staff tienda)',
        emailVerified: true,
        defaultCommunityId: CORO,
      },
      {
        id: U_PEDRO,
        email: 'pedro@3b.test',
        name: 'Pedro (Mover)',
        emailVerified: true,
        defaultCommunityId: PUNTO_FIJO,
      },
      {
        id: U_LUCIA,
        email: 'lucia@3b.test',
        name: 'Lucía (Maker)',
        emailVerified: true,
        defaultCommunityId: CORO,
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(schema.communityLinks)
    .values([
      {
        communityId: CORO,
        neighborId: PUNTO_FIJO,
        distanceKm: 90,
        weight: 0.8,
      },
      {
        communityId: PUNTO_FIJO,
        neighborId: CORO,
        distanceKm: 90,
        weight: 0.8,
      },
      { communityId: CORO, neighborId: SANTA_ANA, distanceKm: 25, weight: 0.9 },
      { communityId: SANTA_ANA, neighborId: CORO, distanceKm: 25, weight: 0.9 },
    ])
    .onConflictDoNothing();

  await db
    .insert(schema.memberships)
    .values([
      { userId: U_ADMIN, communityId: CORO, role: 'member' },
      { userId: U_ANA, communityId: CORO, role: 'admin' }, // admin de comunidad
      { userId: U_CARLOS, communityId: CORO, role: 'member' },
      { userId: U_MARTA, communityId: CORO, role: 'member' },
      { userId: U_LUCIA, communityId: CORO, role: 'member' },
      { userId: U_PEDRO, communityId: PUNTO_FIJO, role: 'member' },
      // Carlos también opera en Punto Fijo (tiene tienda allí).
      { userId: U_CARLOS, communityId: PUNTO_FIJO, role: 'member' },
    ])
    .onConflictDoNothing();

  await db
    .insert(schema.stores)
    .values([
      {
        id: S_FERRETERIA,
        communityId: CORO,
        ownerId: U_CARLOS,
        kind: 'products',
        slug: 'ferreteria-central',
        name: 'Ferretería Central',
      },
      {
        id: S_PELUQUERIA,
        communityId: PUNTO_FIJO,
        ownerId: U_CARLOS,
        kind: 'services',
        slug: 'peluqueria-bella',
        name: 'Peluquería Bella',
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(schema.storeMembers)
    .values([
      { storeId: S_FERRETERIA, userId: U_CARLOS, role: 'owner' },
      { storeId: S_FERRETERIA, userId: U_MARTA, role: 'sales' },
      { storeId: S_PELUQUERIA, userId: U_CARLOS, role: 'owner' },
    ])
    .onConflictDoNothing();

  await db
    .insert(schema.moverProfiles)
    .values([{ userId: U_PEDRO, status: 'approved' }])
    .onConflictDoNothing();

  // Resumen
  const [[c], [u], [s], [m]] = await Promise.all([
    sql`select count(*)::int as n from community.communities`,
    sql`select count(*)::int as n from identity.users`,
    sql`select count(*)::int as n from store.stores`,
    sql`select count(*)::int as n from community.memberships`,
  ]);
  console.log(
    `[seed] comunidades=${c.n} usuarios=${u.n} tiendas=${s.n} membresías=${m.n}`,
  );

  await sql.end();
}

main().catch((err) => {
  console.error('[seed] error:', err);
  process.exit(1);
});
