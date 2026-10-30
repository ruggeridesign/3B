import type { MeResponse } from '@3b/contracts';
import { type AppTransaction, eq, schema } from '@3b/db';

/** Capacidad global del usuario actual (para el middleware de la API). */
export async function readIsPlatformAdmin(
  db: AppTransaction,
  userId: string,
): Promise<boolean> {
  const [u] = await db
    .select({ value: schema.users.isPlatformAdmin })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  return u?.value ?? false;
}

/**
 * Lee la identidad del usuario y resuelve sus capacidades/alcances.
 * Corre con el `db` ligado al contexto RLS del propio usuario: solo ve lo suyo.
 */
export async function readMe(
  db: AppTransaction,
  userId: string,
): Promise<MeResponse | null> {
  const [user] = await db
    .select({
      id: schema.users.id,
      email: schema.users.email,
      name: schema.users.name,
      isPlatformAdmin: schema.users.isPlatformAdmin,
    })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  if (!user) return null;

  const communities = await db
    .select({
      id: schema.communities.id,
      slug: schema.communities.slug,
      name: schema.communities.name,
      role: schema.memberships.role,
    })
    .from(schema.memberships)
    .innerJoin(
      schema.communities,
      eq(schema.communities.id, schema.memberships.communityId),
    )
    .where(eq(schema.memberships.userId, userId));

  const stores = await db
    .select({
      id: schema.stores.id,
      slug: schema.stores.slug,
      name: schema.stores.name,
      role: schema.storeMembers.role,
    })
    .from(schema.storeMembers)
    .innerJoin(schema.stores, eq(schema.stores.id, schema.storeMembers.storeId))
    .where(eq(schema.storeMembers.userId, userId));

  const [mover] = await db
    .select({ status: schema.moverProfiles.status })
    .from(schema.moverProfiles)
    .where(eq(schema.moverProfiles.userId, userId))
    .limit(1);

  return {
    user: { id: user.id, email: user.email, name: user.name },
    capabilities: {
      isMaker: true,
      isSeller: stores.length > 0,
      isMover: mover?.status === 'approved',
      isPlatformAdmin: user.isPlatformAdmin,
    },
    communities: communities.map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      role: c.role as MeResponse['communities'][number]['role'],
    })),
    stores: stores.map((s) => ({
      id: s.id,
      slug: s.slug,
      name: s.name,
      role: s.role as MeResponse['stores'][number]['role'],
    })),
  };
}
