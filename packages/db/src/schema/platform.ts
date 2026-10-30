import { jsonb, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './identity';

// Esquema `platform`: auditoría y parámetros transversales.
export const platform = pgSchema('platform');

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
