import { z } from 'zod';

/**
 * Esquema de variables de entorno compartido.
 * `loadEnv()` valida `process.env` y devuelve un objeto tipado.
 * Lo consumen apps/api y packages/db (no la capa domain).
 */
const envSchema = z.object({
  // Conexión del OWNER (`3b`): solo para migraciones Drizzle y tareas de admin.
  // Puerto 5433 (el 5432 lo ocupa un PostgreSQL nativo de la máquina de dev).
  DATABASE_URL: z
    .string()
    .url()
    .default('postgresql://3b:3b@localhost:5433/3b'),
  // Conexión de la APP (`app`, mínimo privilegio): runtime sujeto a RLS.
  APP_DATABASE_URL: z
    .string()
    .url()
    .default('postgresql://app:app@localhost:5433/3b'),
  API_PORT: z.coerce.number().int().positive().default(8787),
  NEXT_PUBLIC_API_URL: z.string().url().default('http://localhost:8787'),
  // Origen de la app web (para CORS / trustedOrigins de Better Auth).
  WEB_URL: z.string().url().default('http://localhost:3000'),

  // Better Auth. El secret tiene un default SOLO para desarrollo local.
  BETTER_AUTH_SECRET: z
    .string()
    .min(16)
    .default('dev-only-secret-change-me-0123456789abcdef'),
  BETTER_AUTH_URL: z.string().url().default('http://localhost:8787'),
  // Google OAuth: opcional. El desarrollo NO depende de estas credenciales.
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  // Passphrase para cifrar los detalles de métodos de pago en reposo (pgcrypto,
  // pgp_sym_*). Default SOLO para desarrollo; en producción se debe sobrescribir.
  PAYMENTS_ENC_KEY: z
    .string()
    .min(16)
    .default('dev-only-payments-key-change-me-0123456789'),

  // Media (storage de archivos). En dev el storage es local (disco); en prod
  // será R2. `MEDIA_LOCAL_DIR` es la carpeta en disco; `MEDIA_SIGN_SECRET` firma
  // (HMAC) las URLs de subida; `MEDIA_PUBLIC_URL` es la base para servir/subir.
  MEDIA_LOCAL_DIR: z.string().default('./.media-uploads'),
  MEDIA_SIGN_SECRET: z
    .string()
    .min(16)
    .default('dev-only-media-sign-secret-0123456789'),
  MEDIA_PUBLIC_URL: z.string().url().default('http://localhost:8787'),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return envSchema.parse(source);
}
