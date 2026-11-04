import type {
  ApplyMoverInput,
  CreateKycSubmissionInput,
  KycSubmission,
} from '@3b/contracts';
import { type AppTransaction, and, desc, eq, schema } from '@3b/db';

type KycRow = typeof schema.kycSubmissions.$inferSelect;

function toSubmission(row: KycRow): KycSubmission {
  return {
    id: row.id,
    subjectType: row.subjectType as KycSubmission['subjectType'],
    subjectId: row.subjectId,
    docType: row.docType as KycSubmission['docType'],
    mediaId: row.mediaId,
    status: row.status as KycSubmission['status'],
    communityId: row.communityId,
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
    communityId?: string | null;
  } & CreateKycSubmissionInput,
): Promise<KycSubmission> {
  const [row] = await db
    .insert(schema.kycSubmissions)
    .values({
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      docType: input.docType,
      mediaId: input.mediaId ?? null,
      communityId: input.communityId ?? null,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    })
    .returning();
  return toSubmission(row);
}

/** Resultado de postularse como Mover (para mapear a HTTP sin 500). */
export type ApplyMoverResult =
  | { status: 'ok'; submission: KycSubmission }
  | { status: 'already_pending' };

/**
 * Un usuario se postula como **Mover** en una comunidad (M7d.2). Crea su perfil de
 * Mover `pending` si aún no existe (sin pisar uno ya `approved`) y envía una
 * verificación (KYC de sujeto `mover`) a esa comunidad. Al aprobarla, el trigger pone
 * el perfil `approved` y suma la comunidad a `operating_communities`. Idempotente:
 * rechaza una segunda solicitud pendiente a la misma comunidad. La RLS acota el alta.
 */
export async function applyAsMover(
  db: AppTransaction,
  userId: string,
  input: ApplyMoverInput,
): Promise<ApplyMoverResult> {
  // Perfil de Mover `pending` (no pisa uno existente: ON CONFLICT DO NOTHING).
  await db
    .insert(schema.moverProfiles)
    .values({ userId, status: 'pending' })
    .onConflictDoNothing();

  // Una sola solicitud pendiente por comunidad.
  const [dup] = await db
    .select({ id: schema.kycSubmissions.id })
    .from(schema.kycSubmissions)
    .where(
      and(
        eq(schema.kycSubmissions.subjectType, 'mover'),
        eq(schema.kycSubmissions.subjectId, userId),
        eq(schema.kycSubmissions.communityId, input.communityId),
        eq(schema.kycSubmissions.status, 'pending'),
      ),
    )
    .limit(1);
  if (dup) return { status: 'already_pending' };

  const submission = await createSubmission(db, {
    subjectType: 'mover',
    subjectId: userId,
    communityId: input.communityId,
    docType: input.docType,
    mediaId: input.mediaId,
    expiresAt: input.expiresAt,
  });
  return { status: 'ok', submission };
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
 * Cola de revisión de una comunidad: verificaciones `pending` de esa comunidad —
 * **tiendas** (comunidad vía `store.community_id`) y **Movers** (comunidad objetivo en
 * `kyc.community_id`). La RLS acota (solo el admin de la comunidad ve estas filas).
 */
export async function listPendingByCommunity(
  db: AppTransaction,
  communityId: string,
): Promise<KycSubmission[]> {
  // Tiendas de la comunidad (join a store.stores).
  const storeRows = await db
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
    );

  // Movers que solicitan operar en la comunidad (community_id directo).
  const moverRows = await db
    .select()
    .from(schema.kycSubmissions)
    .where(
      and(
        eq(schema.kycSubmissions.subjectType, 'mover'),
        eq(schema.kycSubmissions.status, 'pending'),
        eq(schema.kycSubmissions.communityId, communityId),
      ),
    );

  return [...storeRows.map((r) => r.kyc), ...moverRows]
    .map(toSubmission)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Verificaciones de Mover del propio usuario (sus solicitudes). RLS: solo las suyas. */
export async function listMyMoverApplications(
  db: AppTransaction,
  userId: string,
): Promise<KycSubmission[]> {
  const rows = await db
    .select()
    .from(schema.kycSubmissions)
    .where(
      and(
        eq(schema.kycSubmissions.subjectType, 'mover'),
        eq(schema.kycSubmissions.subjectId, userId),
      ),
    )
    .orderBy(desc(schema.kycSubmissions.createdAt));
  return rows.map(toSubmission);
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
 * Resuelve la comunidad de una verificación, para gatear al revisor con
 * `isCommunityAdmin`: **tienda** → `store.community_id`; **Mover** → `kyc.community_id`
 * (la comunidad objetivo). null si no existe o la RLS la oculta.
 */
export async function getReviewCommunity(
  db: AppTransaction,
  id: string,
): Promise<string | null> {
  const [row] = await db
    .select({
      subjectType: schema.kycSubmissions.subjectType,
      subjectId: schema.kycSubmissions.subjectId,
      communityId: schema.kycSubmissions.communityId,
    })
    .from(schema.kycSubmissions)
    .where(eq(schema.kycSubmissions.id, id))
    .limit(1);
  if (!row) return null;
  if (row.subjectType === 'mover') return row.communityId ?? null;

  const [store] = await db
    .select({ communityId: schema.stores.communityId })
    .from(schema.stores)
    .where(eq(schema.stores.id, row.subjectId))
    .limit(1);
  return store?.communityId ?? null;
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
