import { z } from 'zod';

/**
 * Contratos del módulo `social`. **M5d.2 — reseñas verificadas**: al `completado`
 * el comprador (Maker) puede dejar **una** reseña (rating + comentario) sobre la
 * tienda del pedido (O-3). El destinatario es polimórfico (`store`/`mover`/`maker`,
 * D-04); M5d.2 cablea `store`. Una reseña por `(pedido, autor, destinatario)`.
 * **M5d.3** suma `questions` (preguntas públicas) y **M5d.4** `reports` (moderación).
 */

// UUID laxo (acepta los del seed, que no son v4 estrictos).
const uuid = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

/** A quién apunta la reseña (§2.5 del modelo de datos, D-04). */
export const ReviewSubjectType = z.enum(['store', 'mover', 'maker']);
export type ReviewSubjectType = z.infer<typeof ReviewSubjectType>;

/** Una reseña verificada (nace de un pedido `completado`). */
export const Review = z.object({
  id: z.string(),
  orderId: z.string(),
  authorId: z.string(),
  authorName: z.string().nullable(),
  subjectType: ReviewSubjectType,
  subjectId: z.string(),
  rating: z.number().int().min(1).max(5),
  body: z.string().nullable(),
  createdAt: z.string(),
});
export type Review = z.infer<typeof Review>;

/** Lista de reseñas (p. ej. las de un pedido). */
export const ReviewList = z.object({ reviews: z.array(Review) });
export type ReviewList = z.infer<typeof ReviewList>;

/** Resumen de reseñas de una tienda: conteo, promedio y las más recientes. */
export const StoreReviewSummary = z.object({
  storeId: z.string(),
  count: z.number().int(),
  average: z.number().nullable(),
  reviews: z.array(Review),
});
export type StoreReviewSummary = z.infer<typeof StoreReviewSummary>;

/** El comprador deja una reseña de la tienda de un pedido `completado`. */
export const CreateReviewInput = z.object({
  rating: z.number().int().min(1).max(5),
  body: z.string().max(1000).optional(),
});
export type CreateReviewInput = z.infer<typeof CreateReviewInput>;

/**
 * Pregunta pública sobre un ítem publicado. La hace cualquiera que vea el ítem;
 * la **responde la tienda** (`answer`/`answeredAt`). Visible a quien ve el ítem.
 */
export const Question = z.object({
  id: z.string(),
  itemId: z.string(),
  authorId: z.string(),
  authorName: z.string().nullable(),
  body: z.string(),
  answer: z.string().nullable(),
  answeredAt: z.string().nullable(),
  createdAt: z.string(),
});
export type Question = z.infer<typeof Question>;

/** Lista de preguntas de un ítem (más recientes primero). */
export const QuestionList = z.object({ questions: z.array(Question) });
export type QuestionList = z.infer<typeof QuestionList>;

/** Hacer una pregunta pública sobre un ítem. */
export const AskQuestionInput = z.object({
  body: z.string().min(3).max(1000),
});
export type AskQuestionInput = z.infer<typeof AskQuestionInput>;

/** La tienda responde una pregunta. */
export const AnswerQuestionInput = z.object({
  answer: z.string().min(1).max(2000),
});
export type AnswerQuestionInput = z.infer<typeof AnswerQuestionInput>;

/** Tipo de contenido reportado (moderación). */
export const ReportTargetType = z.enum(['item', 'review', 'question', 'store']);
export type ReportTargetType = z.infer<typeof ReportTargetType>;

/** Estado de un reporte de moderación. */
export const ReportStatus = z.enum([
  'open',
  'reviewing',
  'resolved',
  'dismissed',
]);
export type ReportStatus = z.infer<typeof ReportStatus>;

/** Un reporte de moderación sobre un contenido. */
export const Report = z.object({
  id: z.string(),
  targetType: ReportTargetType,
  targetId: z.string(),
  reason: z.string(),
  status: ReportStatus,
  reporterId: z.string(),
  communityId: z.string(),
  resolutionNote: z.string().nullable(),
  resolvedBy: z.string().nullable(),
  resolvedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type Report = z.infer<typeof Report>;

/** Lista de reportes (cola de moderación). */
export const ReportList = z.object({ reports: z.array(Report) });
export type ReportList = z.infer<typeof ReportList>;

/** Reportar un contenido. `communityId` se deriva del target (no se confía en él). */
export const CreateReportInput = z.object({
  targetType: ReportTargetType,
  targetId: uuid,
  reason: z.string().min(3).max(1000),
});
export type CreateReportInput = z.infer<typeof CreateReportInput>;

/** El admin resuelve un reporte (lo cierra o lo descarta). */
export const ResolveReportInput = z.object({
  status: z.enum(['resolved', 'dismissed']),
  note: z.string().max(1000).optional(),
});
export type ResolveReportInput = z.infer<typeof ResolveReportInput>;
