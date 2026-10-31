import { type AppTransaction, sql } from '@3b/db';

/**
 * Predicados de autorización por ALCANCE/propiedad, reutilizables en cualquier
 * handler. Se derivan de la base con las MISMAS funciones `authz.*`
 * (SECURITY DEFINER) que usan las políticas RLS: así el gate a nivel de ruta y
 * la RLS comparten una única fuente de verdad. El usuario evaluado es siempre
 * el EFECTIVO del contexto de la transacción (`app.user_id`), nunca el cliente.
 *
 * Son defensa en capas (respuesta 403 temprana y clara): la RLS sigue siendo el
 * último candado aunque un handler olvide gatear.
 */

/** Ejecuta un predicado SQL que proyecta una columna booleana `ok`. */
async function bool(
  db: AppTransaction,
  query: ReturnType<typeof sql>,
): Promise<boolean> {
  const rows = (await db.execute(query)) as unknown as Array<{ ok: boolean }>;
  return rows[0]?.ok === true;
}

/** ¿El usuario efectivo es admin de plataforma? (bandera global). */
export function isPlatformAdmin(db: AppTransaction): Promise<boolean> {
  return bool(db, sql`select authz.is_platform_admin() as ok`);
}

/**
 * ¿Es miembro de la tienda con alguno de esos roles? `roles` vacío/omitido =
 * cualquier rol. Capacidad Seller con alcance a una tienda concreta.
 */
export function isStoreMember(
  db: AppTransaction,
  storeId: string,
  roles?: readonly string[],
): Promise<boolean> {
  // `sql` expande un array JS como lista `($1,$2)` (estilo IN), no como array
  // Postgres: pasamos un literal `{...}` de un solo parámetro y lo casteamos.
  // `null` ⇒ cualquier rol (la función trata `roles IS NULL` así).
  const literal =
    roles && roles.length > 0
      ? `{${roles.map((r) => `"${r.replaceAll('"', '\\"')}"`).join(',')}}`
      : null;
  return bool(
    db,
    sql`select authz.is_store_member(${storeId}, ${literal}::text[]) as ok`,
  );
}

/** ¿Puede administrar la tienda? (owner o admin). */
export function canManageStore(
  db: AppTransaction,
  storeId: string,
): Promise<boolean> {
  return isStoreMember(db, storeId, ['owner', 'admin']);
}

/** ¿Es admin de ESA comunidad? (alcance acotado a la comunidad). */
export function isCommunityAdmin(
  db: AppTransaction,
  communityId: string,
): Promise<boolean> {
  return bool(db, sql`select authz.is_community_admin(${communityId}) as ok`);
}

/** ¿Es miembro activo de ESA comunidad? */
export function isCommunityMember(
  db: AppTransaction,
  communityId: string,
): Promise<boolean> {
  return bool(db, sql`select authz.is_member(${communityId}) as ok`);
}

/** ¿Tiene un perfil de Mover aprobado? (capacidad Mover). */
export function isMoverApproved(db: AppTransaction): Promise<boolean> {
  return bool(
    db,
    sql`select exists(
      select 1 from identity.mover_profiles
      where user_id = authz.current_user_id() and status = 'approved'
    ) as ok`,
  );
}
