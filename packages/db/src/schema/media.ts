import { index, jsonb, pgSchema, text, uuid } from 'drizzle-orm/pg-core';
import { timestamps } from './_shared';
import { users } from './identity';

// Esquema `media`: archivos/imágenes transversales (tiendas, ítems, KYC…).
export const media = pgSchema('media');

/**
 * Un archivo subido. `bucket`/`key` ubican el objeto en el storage (local en
 * dev, R2 en prod). `owner_type`/`owner_id` son polimórficos (sin FK dura). Los
 * detalles sensibles no aplican; el acceso lo acota la RLS por `created_by`.
 */
export const mediaFiles = media.table(
  'media',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bucket: text('bucket').notNull(),
    key: text('key').notNull(),
    mime: text('mime').notNull(),
    // Variantes procesadas (p. ej. { thumb: {...} }); vacío hasta M3 (worker).
    sizes: jsonb('sizes').notNull().default({}),
    ownerType: text('owner_type').notNull(), // store | user | …
    ownerId: uuid('owner_id').notNull(),
    status: text('status').notNull().default('pending'), // pending | ready
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    ...timestamps,
  },
  (t) => [index('media_owner_idx').on(t.ownerType, t.ownerId)],
);
