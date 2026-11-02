import {
  index,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { timestamps } from './_shared';
import { users } from './identity';
import { mediaFiles } from './media';

// Esquema `messaging`: conversaciones (hilos) por contexto + sus mensajes.
// M5d.1 — chat contextual (contexto `order`).
export const messaging = pgSchema('messaging');

/**
 * Una conversación cuelga de un contexto (`order` en M5d.1) y su `context_id`.
 * Hay **una** por `(context, context_id)` (índice único). `last_message_at` se
 * refresca al enviar un mensaje (para ordenar/mostrar recencia). La RLS deriva
 * la visibilidad del contexto: en `order`, la ven el Maker dueño y los miembros
 * de la tienda del pedido. `participants` no se materializa (se deriva); su
 * materialización llegará con los contextos que no derivan de una sola entidad.
 */
export const conversations = messaging.table(
  'conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    context: text('context').notNull(), // ConversationContext
    contextId: uuid('context_id').notNull(),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    unique('conversations_context_unique').on(t.context, t.contextId),
    index('conversations_context_idx').on(t.context, t.contextId),
  ],
);

/**
 * Mensaje de una conversación. **Particionada por mes** (D-08) sobre
 * `created_at`: la PK es compuesta `(id, created_at)` porque Postgres exige que
 * la clave incluya la columna de partición. Drizzle no modela particiones
 * declarativas, así que la DDL particionada se escribe a mano en la migración;
 * este objeto es solo para el query builder (apunta a la tabla padre). La RLS se
 * deriva de la conversación padre; `read_at` marca la lectura por la contraparte.
 */
export const messages = messaging.table(
  'messages',
  {
    id: uuid('id').notNull().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    senderId: uuid('sender_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    body: text('body').notNull(),
    mediaId: uuid('media_id').references(() => mediaFiles.id, {
      onDelete: 'set null',
    }),
    readAt: timestamp('read_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    primaryKey({ columns: [t.id, t.createdAt] }),
    index('messages_conversation_idx').on(t.conversationId, t.createdAt),
  ],
);
