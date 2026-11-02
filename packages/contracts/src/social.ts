import { z } from 'zod';

/**
 * Contratos del módulo `social`. **M5d.2 — reseñas verificadas**: al `completado`
 * el comprador (Maker) puede dejar **una** reseña (rating + comentario) sobre la
 * tienda del pedido (O-3). El destinatario es polimórfico (`store`/`mover`/`maker`,
 * D-04); M5d.2 cablea `store`. Una reseña por `(pedido, autor, destinatario)`. Las
 * preguntas públicas (`questions`) llegan en una rebanada posterior.
 */

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
