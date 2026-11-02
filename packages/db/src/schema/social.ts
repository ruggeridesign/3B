import {
  index,
  integer,
  pgSchema,
  text,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { timestamps } from './_shared';
import { communities } from './community';
import { users } from './identity';
import { orderRecords } from './orders';

// Esquema `social`: reseñas verificadas (nacen de un pedido `completado`).
// M5d.2 — reseñas. Las preguntas públicas (`questions`) llegan después.
export const social = pgSchema('social');

/**
 * Reseña verificada de un pedido. El autor (comprador) la deja al `completado`
 * (O-3); el destinatario es polimórfico (`store`/`mover`/`maker`, D-04) sin FK
 * dura al sujeto. **Una** por `(order, author, subject_type)` (único). `author_name`
 * y `community_id` se **congelan** al crearla (snapshot, para mostrar sin joins
 * cruzados y para la RLS por comunidad). Append-only: no se edita ni borra. La RLS:
 * la ve quien ve la comunidad; la crea el comprador del pedido completado.
 */
export const reviews = social.table(
  'reviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orderRecords.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    authorName: text('author_name'),
    subjectType: text('subject_type').notNull(), // store | mover | maker
    subjectId: uuid('subject_id').notNull(),
    // Denormalizado del pedido para la RLS por comunidad (D-05).
    communityId: uuid('community_id')
      .notNull()
      .references(() => communities.id, { onDelete: 'restrict' }),
    rating: integer('rating').notNull(),
    body: text('body'),
    ...timestamps,
  },
  (t) => [
    // D-04: una reseña por pedido y destinatario.
    unique('reviews_order_author_subject_unique').on(
      t.orderId,
      t.authorId,
      t.subjectType,
    ),
    index('reviews_subject_idx').on(t.subjectType, t.subjectId),
    index('reviews_community_idx').on(t.communityId),
  ],
);
