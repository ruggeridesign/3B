import type {
  CreateReviewInput,
  Review,
  StoreReviewSummary,
} from '@3b/contracts';
import { type AppTransaction, and, desc, eq, schema } from '@3b/db';
import { getOrder } from '../../orders';

type ReviewRow = typeof schema.reviews.$inferSelect;

function toReview(row: ReviewRow): Review {
  return {
    id: row.id,
    orderId: row.orderId,
    authorId: row.authorId,
    authorName: row.authorName,
    subjectType: row.subjectType as Review['subjectType'],
    subjectId: row.subjectId,
    rating: row.rating,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Nombre a mostrar del propio usuario (self-select, permitido por la RLS). */
async function ownName(
  db: AppTransaction,
  userId: string,
): Promise<string | null> {
  const [u] = await db
    .select({ name: schema.users.name })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  return u?.name ?? null;
}

/** Reseñas de un pedido (las que la RLS deje ver), más recientes primero. */
export async function listOrderReviews(
  db: AppTransaction,
  orderId: string,
): Promise<Review[]> {
  const rows = await db
    .select()
    .from(schema.reviews)
    .where(eq(schema.reviews.orderId, orderId))
    .orderBy(desc(schema.reviews.createdAt));
  return rows.map(toReview);
}

/** Resumen de reseñas de una tienda: conteo, promedio y las recientes. */
export async function storeReviewSummary(
  db: AppTransaction,
  storeId: string,
): Promise<StoreReviewSummary> {
  const rows = await db
    .select()
    .from(schema.reviews)
    .where(
      and(
        eq(schema.reviews.subjectType, 'store'),
        eq(schema.reviews.subjectId, storeId),
      ),
    )
    .orderBy(desc(schema.reviews.createdAt));

  const count = rows.length;
  const average =
    count === 0
      ? null
      : Math.round((rows.reduce((s, r) => s + r.rating, 0) / count) * 10) / 10;
  return { storeId, count, average, reviews: rows.map(toReview) };
}

/** Resultado de crear una reseña (para mapear a HTTP sin 500). */
export type CreateReviewResult =
  | { status: 'ok'; review: Review }
  | { status: 'order_not_found' }
  | { status: 'forbidden' }
  | { status: 'not_completed'; current: string }
  | { status: 'duplicate' };

/**
 * El comprador deja una reseña de la **tienda** de un pedido `completado` (O-3).
 * Verifica dueño + estado + no-duplicado (único `(order, author, 'store')`, D-04);
 * congela `author_name` y `community_id` del pedido. La RLS es el candado final:
 * solo el Maker de un pedido completado de esa comunidad/tienda inserta.
 */
export async function createStoreReview(
  db: AppTransaction,
  orderId: string,
  authorId: string,
  input: CreateReviewInput,
): Promise<CreateReviewResult> {
  const order = await getOrder(db, orderId);
  if (!order) return { status: 'order_not_found' };
  if (order.makerId !== authorId) return { status: 'forbidden' };
  if (order.status !== 'completado') {
    return { status: 'not_completed', current: order.status };
  }

  // D-04: una reseña de la tienda por pedido y autor.
  const [dup] = await db
    .select({ id: schema.reviews.id })
    .from(schema.reviews)
    .where(
      and(
        eq(schema.reviews.orderId, orderId),
        eq(schema.reviews.authorId, authorId),
        eq(schema.reviews.subjectType, 'store'),
      ),
    )
    .limit(1);
  if (dup) return { status: 'duplicate' };

  const name = await ownName(db, authorId);

  const [row] = await db
    .insert(schema.reviews)
    .values({
      orderId,
      authorId,
      authorName: name,
      subjectType: 'store',
      subjectId: order.storeId,
      communityId: order.communityId,
      rating: input.rating,
      body: input.body ?? null,
    })
    .returning();

  return { status: 'ok', review: toReview(row as ReviewRow) };
}
