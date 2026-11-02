import type {
  CreateReportInput,
  Report,
  ReportStatus,
  ReportTargetType,
} from '@3b/contracts';
import { type AppTransaction, desc, eq, schema } from '@3b/db';

type ReportRow = typeof schema.reports.$inferSelect;

function toReport(row: ReportRow): Report {
  return {
    id: row.id,
    targetType: row.targetType as Report['targetType'],
    targetId: row.targetId,
    reason: row.reason,
    status: row.status as Report['status'],
    reporterId: row.reporterId,
    communityId: row.communityId,
    resolutionNote: row.resolutionNote,
    resolvedBy: row.resolvedBy,
    resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Comunidad del contenido reportado (bajo RLS: si el reporter no lo ve, devuelve
 * null → target inexistente). Deriva el alcance del reporte **del target**, nunca
 * del cliente. Sin FK dura: el `target_type` elige la tabla.
 */
async function targetCommunity(
  db: AppTransaction,
  targetType: ReportTargetType,
  targetId: string,
): Promise<string | null> {
  if (targetType === 'item') {
    const [r] = await db
      .select({ c: schema.items.communityId })
      .from(schema.items)
      .where(eq(schema.items.id, targetId))
      .limit(1);
    return r?.c ?? null;
  }
  if (targetType === 'review') {
    const [r] = await db
      .select({ c: schema.reviews.communityId })
      .from(schema.reviews)
      .where(eq(schema.reviews.id, targetId))
      .limit(1);
    return r?.c ?? null;
  }
  if (targetType === 'question') {
    const [r] = await db
      .select({ c: schema.questions.communityId })
      .from(schema.questions)
      .where(eq(schema.questions.id, targetId))
      .limit(1);
    return r?.c ?? null;
  }
  const [r] = await db
    .select({ c: schema.stores.communityId })
    .from(schema.stores)
    .where(eq(schema.stores.id, targetId))
    .limit(1);
  return r?.c ?? null;
}

/** Resultado de crear un reporte (para mapear a HTTP sin 500). */
export type CreateReportResult =
  | { status: 'ok'; report: Report }
  | { status: 'target_not_found' };

/**
 * Crea un reporte de moderación. Deriva `community_id` del target (acota la cola a
 * los admins de esa comunidad) y lo inserta como `open`. La RLS es el candado:
 * reporter = uno mismo, y debe ver la comunidad.
 */
export async function createReport(
  db: AppTransaction,
  reporterId: string,
  input: CreateReportInput,
): Promise<CreateReportResult> {
  const communityId = await targetCommunity(
    db,
    input.targetType,
    input.targetId,
  );
  if (!communityId) return { status: 'target_not_found' };

  const [row] = await db
    .insert(schema.reports)
    .values({
      targetType: input.targetType,
      targetId: input.targetId,
      reason: input.reason,
      reporterId,
      communityId,
    })
    .returning();
  return { status: 'ok', report: toReport(row as ReportRow) };
}

/**
 * Cola de reportes visible para el usuario (la RLS la acota: admin de la comunidad
 * / de plataforma ven los de su alcance; cada reporter ve los suyos). Filtra por
 * `status` si se pasa; más recientes primero.
 */
export async function listReports(
  db: AppTransaction,
  status?: ReportStatus,
): Promise<Report[]> {
  const rows = status
    ? await db
        .select()
        .from(schema.reports)
        .where(eq(schema.reports.status, status))
        .orderBy(desc(schema.reports.createdAt))
    : await db
        .select()
        .from(schema.reports)
        .orderBy(desc(schema.reports.createdAt));
  return rows.map(toReport);
}

/** Resultado de resolver un reporte (para mapear a HTTP sin 500). */
export type ResolveReportResult =
  | { status: 'ok'; report: Report }
  | { status: 'not_found' };

/**
 * Resuelve o descarta un reporte (acción de admin de la comunidad o de plataforma).
 * La RLS (UPDATE = admin) es el candado: a un no-admin no le afecta ninguna fila.
 */
export async function resolveReport(
  db: AppTransaction,
  id: string,
  adminId: string,
  status: 'resolved' | 'dismissed',
  note: string | null,
): Promise<ResolveReportResult> {
  const [row] = await db
    .update(schema.reports)
    .set({
      status,
      resolutionNote: note,
      resolvedBy: adminId,
      resolvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(schema.reports.id, id))
    .returning();
  if (!row) return { status: 'not_found' };
  return { status: 'ok', report: toReport(row as ReportRow) };
}
