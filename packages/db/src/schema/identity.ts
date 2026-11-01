import {
  boolean,
  index,
  pgSchema,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { timestamps } from './_shared';

// Esquema `identity`: una identidad global por usuario.
export const identity = pgSchema('identity');

/**
 * Usuario global. Es la tabla canónica de identidad; Better Auth se cablea
 * sobre ella en el Hito B (sin duplicar estructuras). Todo usuario es Maker.
 */
export const users = identity.table('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  name: text('name'),
  image: text('image'),
  phone: text('phone'),
  // Comunidad por defecto (FK blanda por ahora; se endurece al cablear community).
  defaultCommunityId: uuid('default_community_id'),
  // Bandera GLOBAL, reservada a administradores de plataforma.
  isPlatformAdmin: boolean('is_platform_admin').notNull().default(false),
  status: text('status').notNull().default('active'),
  ...timestamps,
});

/** Capacidad de Mover: perfil de repartidor (aprobación manual). */
export const moverProfiles = identity.table('mover_profiles', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  status: text('status').notNull().default('pending'), // pending | approved | suspended
  ...timestamps,
});

/**
 * Verificación KYC (datos y archivos sensibles). Polimórfica por
 * `subject_type`/`subject_id` (M2 usa `store`). El documento es una media
 * (`media_id`, FK blanda agregada en la migración para no acoplar los esquemas).
 * La RLS y el trigger que fija `stores.verification_level` al aprobar viven en la
 * migración.
 */
export const kycSubmissions = identity.table(
  'kyc_submissions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    subjectType: text('subject_type').notNull(), // store | mover
    subjectId: uuid('subject_id').notNull(),
    docType: text('doc_type').notNull(), // rif | cedula | pasaporte | other
    mediaId: uuid('media_id'), // FK a media.media (ON DELETE SET NULL, en migración)
    status: text('status').notNull().default('pending'), // pending | approved | rejected
    reviewerId: uuid('reviewer_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    reviewNotes: text('review_notes'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index('kyc_subject_idx').on(t.subjectType, t.subjectId),
    index('kyc_status_idx').on(t.status),
  ],
);

// ── Tablas de Better Auth (mapeadas sobre identity.users; sin duplicar) ──
// Las gestiona SOLO Better Auth con la conexión owner (bypassa RLS); el rol
// `app` no recibe grants sobre ellas.

export const sessions = identity.table('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  ...timestamps,
});

export const accounts = identity.table('accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', {
    withTimezone: true,
  }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', {
    withTimezone: true,
  }),
  scope: text('scope'),
  password: text('password'),
  ...timestamps,
});

export const verifications = identity.table('verifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  ...timestamps,
});
