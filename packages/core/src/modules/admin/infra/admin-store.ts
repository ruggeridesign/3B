import { type AppTransaction, schema } from '@3b/db';

export interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  isPlatformAdmin: boolean;
}

/** Lista usuarios (bajo RLS, solo el admin de plataforma ve a todos). */
export function listUsers(db: AppTransaction): Promise<AdminUser[]> {
  return db
    .select({
      id: schema.users.id,
      email: schema.users.email,
      name: schema.users.name,
      isPlatformAdmin: schema.users.isPlatformAdmin,
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
