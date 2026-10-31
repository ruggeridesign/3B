import type { AssignableStoreRole, Store, StoreMember } from '@3b/contracts';
import { type AppTransaction, and, eq, schema } from '@3b/db';

type StoreRow = typeof schema.stores.$inferSelect;

/** Proyecta una fila de `store.stores` al DTO público. */
function toStore(row: StoreRow): Store {
  return {
    id: row.id,
    communityId: row.communityId,
    ownerId: row.ownerId,
    kind: row.kind as Store['kind'],
    slug: row.slug,
    name: row.name,
    status: row.status as Store['status'],
    createdAt: row.createdAt.toISOString(),
  };
}

export interface NewStore {
  ownerId: string;
  communityId: string;
  kind: Store['kind'];
  slug: string;
  name: string;
}

/**
 * Crea una tienda. La RLS exige `owner_id = usuario actual` y que sea miembro de
 * la comunidad. El trigger `stores_owner_membership` crea la membresía `owner`
 * en la MISMA transacción (ver migración 0005).
 */
export async function createStore(
  db: AppTransaction,
  input: NewStore,
): Promise<Store> {
  const [row] = await db
    .insert(schema.stores)
    .values({
      ownerId: input.ownerId,
      communityId: input.communityId,
      kind: input.kind,
      slug: input.slug,
      name: input.name,
    })
    .returning();
  return toStore(row);
}

/** Tiendas donde el usuario es miembro (cualquier rol). Capacidad Seller. */
export async function listMyStores(
  db: AppTransaction,
  userId: string,
): Promise<Store[]> {
  const rows = await db
    .select()
    .from(schema.stores)
    .innerJoin(
      schema.storeMembers,
      eq(schema.storeMembers.storeId, schema.stores.id),
    )
    .where(eq(schema.storeMembers.userId, userId));
  return rows.map((r) => toStore(r.stores));
}

/** Una tienda por id, si la RLS la deja ver (miembro, admin o comunidad visible). */
export async function getStore(
  db: AppTransaction,
  id: string,
): Promise<Store | null> {
  const [row] = await db
    .select()
    .from(schema.stores)
    .where(eq(schema.stores.id, id))
    .limit(1);
  return row ? toStore(row) : null;
}

// ===== Equipo de la tienda (store_members) =====

/**
 * Equipo de una tienda. La RLS `sm_select` ya la acota a miembros de la tienda.
 * Se usa LEFT JOIN a `users` para que ningún miembro desaparezca del listado si
 * la RLS de `users` oculta su fila (no comparte comunidad con quien consulta):
 * en ese caso name/email quedan en null, pero el rol siempre se ve.
 */
export async function listStoreMembers(
  db: AppTransaction,
  storeId: string,
): Promise<StoreMember[]> {
  const rows = await db
    .select({
      userId: schema.storeMembers.userId,
      name: schema.users.name,
      email: schema.users.email,
      role: schema.storeMembers.role,
      createdAt: schema.storeMembers.createdAt,
    })
    .from(schema.storeMembers)
    .leftJoin(schema.users, eq(schema.users.id, schema.storeMembers.userId))
    .where(eq(schema.storeMembers.storeId, storeId));
  return rows.map((r) => ({
    userId: r.userId,
    name: r.name ?? null,
    email: r.email ?? null,
    role: r.role as StoreMember['role'],
    createdAt: r.createdAt.toISOString(),
  }));
}

/**
 * Resuelve un usuario por email bajo la RLS del que consulta: solo encuentra a
 * quien comparte una comunidad con él (o a sí mismo / si es admin de plataforma).
 * Devuelve null si no existe o la RLS lo oculta (no se filtra cuál de las dos).
 */
export async function findUserIdByEmail(
  db: AppTransaction,
  email: string,
): Promise<string | null> {
  const [row] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);
  return row?.id ?? null;
}

/**
 * Agrega un miembro al equipo. La RLS `sm_insert` exige que el actor sea
 * owner/admin de la tienda. Si el usuario ya es miembro, el INSERT viola la PK
 * (23505) y lo traduce el `onError` central a 409. El rol es siempre asignable
 * (nunca `owner`).
 */
export async function addStoreMember(
  db: AppTransaction,
  input: { storeId: string; userId: string; role: AssignableStoreRole },
): Promise<StoreMember> {
  await db.insert(schema.storeMembers).values({
    storeId: input.storeId,
    userId: input.userId,
    role: input.role,
  });
  const [member] = await loadMembers(db, input.storeId, input.userId);
  return member;
}

/** Resultado de una mutación sobre un miembro (para mapear a HTTP sin 500). */
export type MemberUpdateResult =
  | { status: 'ok'; member: StoreMember }
  | { status: 'not_found' }
  | { status: 'owner_protected' };

export type MemberDeleteResult =
  | { status: 'ok' }
  | { status: 'not_found' }
  | { status: 'owner_protected' };

/**
 * Cambia el rol de un miembro. Invariante: al `owner` no se lo toca (no se lo
 * degrada ni se crea un segundo owner), así la tienda nunca pierde su dueño.
 */
export async function updateStoreMemberRole(
  db: AppTransaction,
  input: { storeId: string; userId: string; role: AssignableStoreRole },
): Promise<MemberUpdateResult> {
  const current = await currentRole(db, input.storeId, input.userId);
  if (current === null) return { status: 'not_found' };
  if (current === 'owner') return { status: 'owner_protected' };

  await db
    .update(schema.storeMembers)
    .set({ role: input.role })
    .where(memberWhere(input.storeId, input.userId));
  const [member] = await loadMembers(db, input.storeId, input.userId);
  return { status: 'ok', member };
}

/** Quita a un miembro del equipo. Invariante: al `owner` no se lo quita. */
export async function removeStoreMember(
  db: AppTransaction,
  input: { storeId: string; userId: string },
): Promise<MemberDeleteResult> {
  const current = await currentRole(db, input.storeId, input.userId);
  if (current === null) return { status: 'not_found' };
  if (current === 'owner') return { status: 'owner_protected' };

  await db
    .delete(schema.storeMembers)
    .where(memberWhere(input.storeId, input.userId));
  return { status: 'ok' };
}

// --- helpers internos ---

function memberWhere(storeId: string, userId: string) {
  return and(
    eq(schema.storeMembers.storeId, storeId),
    eq(schema.storeMembers.userId, userId),
  );
}

/** Rol actual de un miembro, o null si no existe / la RLS no lo deja ver. */
async function currentRole(
  db: AppTransaction,
  storeId: string,
  userId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ role: schema.storeMembers.role })
    .from(schema.storeMembers)
    .where(memberWhere(storeId, userId))
    .limit(1);
  return row?.role ?? null;
}

/** Carga uno o todos los miembros (con datos de usuario) filtrando por userId. */
function loadMembers(
  db: AppTransaction,
  storeId: string,
  userId: string,
): Promise<StoreMember[]> {
  return db
    .select({
      userId: schema.storeMembers.userId,
      name: schema.users.name,
      email: schema.users.email,
      role: schema.storeMembers.role,
      createdAt: schema.storeMembers.createdAt,
    })
    .from(schema.storeMembers)
    .leftJoin(schema.users, eq(schema.users.id, schema.storeMembers.userId))
    .where(memberWhere(storeId, userId))
    .then((rows) =>
      rows.map((r) => ({
        userId: r.userId,
        name: r.name ?? null,
        email: r.email ?? null,
        role: r.role as StoreMember['role'],
        createdAt: r.createdAt.toISOString(),
      })),
    );
}
