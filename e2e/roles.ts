/** Usuarios del seed usados en E2E (ver `@3b/auth/seed-credentials`). */
export const CREDS = [
  { role: 'admin', email: 'admin@3b.test' },
  { role: 'lucia', email: 'lucia@3b.test' },
  { role: 'carlos', email: 'carlos@3b.test' },
  { role: 'pedro', email: 'pedro@3b.test' },
  { role: 'ana', email: 'ana@3b.test' },
] as const;

export const DEV_PASSWORD = 'Password123!';

/** Ruta del `storageState` guardado por el proyecto `setup` para un rol. */
export const storage = (role: string): string => `e2e/.auth/${role}.json`;
