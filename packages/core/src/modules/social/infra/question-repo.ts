import type { Question } from '@3b/contracts';
import { type AppTransaction, desc, eq, schema } from '@3b/db';

type QuestionRow = typeof schema.questions.$inferSelect;

function toQuestion(row: QuestionRow): Question {
  return {
    id: row.id,
    itemId: row.itemId,
    authorId: row.authorId,
    authorName: row.authorName,
    body: row.body,
    answer: row.answer,
    answeredAt: row.answeredAt ? row.answeredAt.toISOString() : null,
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

/** Preguntas de un ítem (más recientes primero). La RLS las acota. */
export async function listItemQuestions(
  db: AppTransaction,
  itemId: string,
): Promise<Question[]> {
  const rows = await db
    .select()
    .from(schema.questions)
    .where(eq(schema.questions.itemId, itemId))
    .orderBy(desc(schema.questions.createdAt));
  return rows.map(toQuestion);
}

/** Resultado de preguntar (para mapear a HTTP sin 500). */
export type AskResult =
  | { status: 'ok'; question: Question }
  | { status: 'item_not_found' }
  | { status: 'item_not_available' };

/**
 * Hace una pregunta pública sobre un ítem **publicado y visible**. Denormaliza
 * `store_id`/`community_id` del ítem (para la RLS) y congela `author_name`. La RLS
 * es el candado: inserta quien ve la comunidad, como sí mismo.
 */
export async function askQuestion(
  db: AppTransaction,
  itemId: string,
  authorId: string,
  body: string,
): Promise<AskResult> {
  const [item] = await db
    .select({
      storeId: schema.items.storeId,
      communityId: schema.items.communityId,
      status: schema.items.status,
    })
    .from(schema.items)
    .where(eq(schema.items.id, itemId))
    .limit(1);
  if (!item) return { status: 'item_not_found' };
  if (item.status !== 'published') return { status: 'item_not_available' };

  const name = await ownName(db, authorId);
  const [row] = await db
    .insert(schema.questions)
    .values({
      itemId,
      storeId: item.storeId,
      communityId: item.communityId,
      authorId,
      authorName: name,
      body,
    })
    .returning();
  return { status: 'ok', question: toQuestion(row as QuestionRow) };
}

/** Cabecera mínima de una pregunta (bajo RLS) para autorizar la respuesta. */
export async function findQuestion(
  db: AppTransaction,
  id: string,
): Promise<{ id: string; storeId: string; answered: boolean } | null> {
  const [row] = await db
    .select({
      id: schema.questions.id,
      storeId: schema.questions.storeId,
      answeredAt: schema.questions.answeredAt,
    })
    .from(schema.questions)
    .where(eq(schema.questions.id, id))
    .limit(1);
  if (!row) return null;
  return {
    id: row.id,
    storeId: row.storeId,
    answered: row.answeredAt !== null,
  };
}

/** Resultado de responder (para mapear a HTTP sin 500). */
export type AnswerResult =
  | { status: 'ok'; question: Question }
  | { status: 'not_found' };

/**
 * La tienda responde una pregunta (fija `answer`/`answered_by`/`answered_at`). La
 * autorización de miembro de la tienda la gatea la capa http; la RLS (UPDATE =
 * miembro de la tienda) es el candado final.
 */
export async function answerQuestion(
  db: AppTransaction,
  id: string,
  answererId: string,
  answer: string,
): Promise<AnswerResult> {
  const [row] = await db
    .update(schema.questions)
    .set({
      answer,
      answeredBy: answererId,
      answeredAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(schema.questions.id, id))
    .returning();
  if (!row) return { status: 'not_found' };
  return { status: 'ok', question: toQuestion(row as QuestionRow) };
}
