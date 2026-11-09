import { defineConfig } from 'vitest/config';

// Tests de integración de la API: ejercitan la app Hono in-process
// (`app.request(...)`) contra Better Auth + DB reales (requieren seed +
// credenciales). Secuenciales: comparten la misma base sembrada.
export default defineConfig({
  test: {
    include: ['test/integration/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
