import { sql } from 'drizzle-orm';
import {
  index,
  jsonb,
  pgSchema,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './identity';

// Esquema `platform`: auditoría, outbox y parámetros transversales.
export const platform = pgSchema('platform');

/**
 * Outbox de eventos de dominio (solo inserción). Un productor escribe el evento
 * en la **misma transacción** que el cambio de negocio; el **worker** lo lee y lo
 * publica (Valkey) marcando `published_at`. Tabla de sistema: la escribe el worker
 * (owner) y —más adelante— las transacciones de negocio; sin acceso para `app` por
 * ahora. El índice parcial acelera "pendientes" (`published_at IS NULL`).
 */
export const outbox = platform.table(
  'outbox',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    topic: text('topic').notNull(),
    payload: jsonb('payload').notNull().default({}),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('outbox_unpublished_idx')
      .on(t.createdAt)
      .where(sql`published_at IS NULL`),
  ],
);

/** Bitácora de acciones administrativas sensibles (solo inserción). */
export const auditLog = platform.table('audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  actorId: uuid('actor_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  action: text('action').notNull(),
  subjectType: text('subject_type'),
  subjectId: uuid('subject_id'),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});
