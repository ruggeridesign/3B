import { timestamp } from 'drizzle-orm/pg-core';

/** Columnas de auditoría temporal comunes (timestamptz). */
export const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
};
