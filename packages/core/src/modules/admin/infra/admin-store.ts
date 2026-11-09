import { type AppTransaction, schema, sql } from '@3b/db';

export interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  isPlatformAdmin: boolean;
  // Capacidades derivadas (para el selector "Ver como" por rol). isMaker es
  // implícito (todo usuario lo es), por eso no se incluye.
  isSeller: boolean;
  isMover: boolean;
  isCommunityAdmin: boolean;
}

/**
 * Lista usuarios con sus capacidades (bajo RLS, solo el admin de plataforma ve a
 * todos). Las capacidades se derivan por subconsultas EXISTS: Seller = tiene
 * membresía de tienda; Mover = perfil aprobado; admin de comunidad = membresía
 * con rol `admin`.
 */
export function listUsers(db: AppTransaction): Promise<AdminUser[]> {
  return db
    .select({
      id: schema.users.id,
      email: schema.users.email,
      name: schema.users.name,
      isPlatformAdmin: schema.users.isPlatformAdmin,
      isSeller: sql<boolean>`exists (select 1 from ${schema.storeMembers} where ${schema.storeMembers.userId} = ${schema.users.id})`,
      isMover: sql<boolean>`exists (select 1 from ${schema.moverProfiles} where ${schema.moverProfiles.userId} = ${schema.users.id} and ${schema.moverProfiles.status} = 'approved')`,
      isCommunityAdmin: sql<boolean>`exists (select 1 from ${schema.memberships} where ${schema.memberships.userId} = ${schema.users.id} and ${schema.memberships.role} = 'admin')`,
    })
    .from(schema.users);
}

export interface AuditEntry {
  actorId: string;
  action: string;
  subjectType?: string;
  subjectId?: string;
  metadata?: Record<string, unknown>;
}

/** Registra una acción administrativa sensible (bitácora de solo inserción). */
export async function recordAudit(
  db: AppTransaction,
  entry: AuditEntry,
): Promise<void> {
  await db.insert(schema.auditLog).values({
    actorId: entry.actorId,
    action: entry.action,
    subjectType: entry.subjectType ?? null,
    subjectId: entry.subjectId ?? null,
    metadata: entry.metadata ?? {},
  });
}
