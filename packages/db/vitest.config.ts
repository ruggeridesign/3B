import { defineConfig } from 'vitest/config';

// Config por defecto (tests unitarios). Los tests de integración viven en
// test/integration/ y se excluyen acá: requieren una DB real y corren con
// `pnpm test:integration` (vitest.integration.config.ts).
export default defineConfig({
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', '**/test/integration/**'],
  },
});
