import { defineConfig } from 'vitest/config';

// Config por defecto (tests unitarios). Los de integración (DB real) viven en
// test/integration/ y se excluyen; se corren con `pnpm test:integration`.
export default defineConfig({
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', '**/test/integration/**'],
  },
});
