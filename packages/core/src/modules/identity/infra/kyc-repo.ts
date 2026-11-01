import type { CreateKycSubmissionInput, KycSubmission } from '@3b/contracts';
import { type AppTransaction, and, eq, schema } from '@3b/db';

type KycRow = typeof schema.kycSubmissions.$inferSelect;

function toSubmission(row: KycRow): KycSubmission {
  return {
    id: row.id,
    subjectType: row.subjectType as KycSubmission['subjectType'],
    subjectId: row.subjectId,
    docType: row.docType as KycSubmission['docType'],
    mediaId: row.mediaId,
    status: row.status as KycSubmission['status'],
    reviewerId: row.reviewerId,
    reviewNotes: row.reviewNotes,
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    reviewedAt: row.reviewedAt ? row.reviewedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Crea una verificación `pending` para un sujeto (la RLS acota el alta). */
export async function createSubmission(
  db: AppTransaction,
  input: {
    subjectType: KycSubmission['subjectType'];
    subjectId: string;
  } & CreateKycSubmissionInput,
): Promise<KycSubmission> {
  const [row] = await db
    .insert(schema.kycSubmissions)
    .values({
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      docType: input.docType,
      mediaId: input.mediaId ?? null,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    })
    .returning();
  return toSubmission(row);
}

/** Verificaciones de un sujeto (p. ej. una tienda). La RLS acota la visibilidad. */
export async function listSubmissionsBySubject(
  db: AppTransaction,
  subjectType: KycSubmission['subjectType'],
  subjectId: string,
): Promise<KycSubmission[]> {
  const rows = await db
    .select()
    .from(schema.kycSubmissions)
    .where(
      and(
        eq(schema.kycSubmissions.subjectType, subjectType),
        eq(schema.kycSubmissions.subjectId, subjectId),
      ),
    )
    .orderBy(schema.kycSubmissions.createdAt);
  return rows.map(toSubmission);
}

/**
 * Cola de revisión de una comunidad: verificaciones `pending` de las tiendas de
 * esa comunidad. Join a store.stores; la RLS de ambas tablas acota (solo el admin
 * de la comunidad ve estas filas).
 */
export async function listPendingByCommunity(
  db: AppTransaction,
  communityId: string,
): Promise<KycSubmission[]> {
  const rows = await db
    .select({ kyc: schema.kycSubmissions })
    .from(schema.kycSubmissions)
    .innerJoin(
      schema.stores,
      eq(schema.stores.id, schema.kycSubmissions.subjectId),
    )
    .where(
      and(
        eq(schema.kycSubmissions.subjectType, 'store'),
        eq(schema.kycSubmissions.status, 'pending'),
        eq(schema.stores.communityId, communityId),
      ),
    )
    .orderBy(schema.kycSubmissions.createdAt);
  return rows.map((r) => toSubmission(r.kyc));
}

/** Una verificación por id (o null si no existe / la RLS la oculta). */
export async function getSubmission(
  db: AppTransaction,
  id: string,
): Promise<KycSubmission | null> {
  const [row] = await db
    .select()
    .from(schema.kycSubmissions)
    .where(eq(schema.kycSubmissions.id, id))
    .limit(1);
  return row ? toSubmission(row) : null;
}

/**
 * Resuelve la comunidad del sujeto de una verificación de tienda (para gatear al
 * revisor con `isCommunityAdmin`). null si no existe, no es de tienda, o la RLS la
 * oculta.
 */
export async function getReviewCommunity(
  db: AppTransaction,
  id: string,
): Promise<string | null> {
  const [row] = await db
    .select({ communityId: schema.stores.communityId })
    .from(schema.kycSubmissions)
    .innerJoin(
      schema.stores,
      eq(schema.stores.id, schema.kycSubmissions.subjectId),
    )
    .where(
      and(
        eq(schema.kycSubmissions.id, id),
        eq(schema.kycSubmissions.subjectType, 'store'),
      ),
    )
    .limit(1);
  return row?.communityId ?? null;
}

/**
 * Registra la decisión del revisor. El trigger de la base fija el
 * `verification_level` de la tienda al aprobar/rechazar. null si no existe (o la
 * RLS no deja actualizar: solo el admin de la comunidad del sujeto).
 */
export async function reviewSubmission(
  db: AppTransaction,
  id: string,
  reviewerId: string,
  decision: 'approve' | 'reject',
  notes: string | null,
): Promise<KycSubmission | null> {
  const [row] = await db
    .update(schema.kycSubmissions)
    .set({
      status: decision === 'approve' ? 'approved' : 'rejected',
      reviewerId,
      reviewNotes: notes,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(schema.kycSubmissions.id, id))
    .returning();
  return row ? toSubmission(row) : null;
}
