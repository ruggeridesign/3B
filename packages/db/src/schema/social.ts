import {
  index,
  integer,
  pgSchema,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { timestamps } from './_shared';
import { items } from './catalog';
import { communities } from './community';
import { users } from './identity';
import { orderRecords } from './orders';
import { stores } from './store';

// Esquema `social`: reseñas verificadas (M5d.2) + preguntas públicas (M5d.3).
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

/**
 * Pregunta pública sobre un ítem publicado. La hace cualquiera que vea el ítem
 * (community member); la **responde la tienda**. `store_id`/`community_id` se
 * denormalizan del ítem para la RLS (answer = miembro de la tienda; visibilidad
 * por comunidad, como el descubrimiento). `author_name` se congela (snapshot).
 */
export const questions = social.table(
  'questions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    communityId: uuid('community_id')
      .notNull()
      .references(() => communities.id, { onDelete: 'restrict' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    authorName: text('author_name'),
    body: text('body').notNull(),
    answer: text('answer'),
    answeredBy: uuid('answered_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    answeredAt: timestamp('answered_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index('questions_item_idx').on(t.itemId, t.createdAt),
    index('questions_community_idx').on(t.communityId),
  ],
);
