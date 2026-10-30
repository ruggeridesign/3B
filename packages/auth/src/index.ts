import { randomUUID } from 'node:crypto';
import { loadEnv } from '@3b/config';
import { createDb, schema } from '@3b/db';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';

const env = loadEnv();

// Better Auth gestiona identidades: usa la conexión OWNER (bypassa RLS).
// El rol `app` (runtime sujeto a RLS) NO tiene grants sobre las tablas de auth.
const db = createDb(env.DATABASE_URL);

const googleConfigured = Boolean(
  env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET,
);

export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: 'pg',
    // Mapea los modelos de Better Auth a nuestras tablas (sin duplicar identidad).
    schema: {
      user: schema.users,
      session: schema.sessions,
      account: schema.accounts,
      verification: schema.verifications,
    },
  }),
  emailAndPassword: {
    enabled: true,
    // Dev: sin verificación por email (no dependemos de un proveedor externo).
    requireEmailVerification: false,
  },
  // Google OAuth queda PREPARADO pero no se activa sin credenciales.
  socialProviders: googleConfigured
    ? {
        google: {
          clientId: env.GOOGLE_CLIENT_ID as string,
          clientSecret: env.GOOGLE_CLIENT_SECRET as string,
        },
      }
    : undefined,
  advanced: {
    database: {
      // La app usa uuid; generamos uuid válidos que encajan en las columnas.
      generateId: () => randomUUID(),
    },
  },
});

export type Auth = typeof auth;
