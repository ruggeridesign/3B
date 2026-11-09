import { defineConfig } from 'vitest/config';

// Config por defecto (sin tests unitarios por ahora). Los de integración
// (app HTTP in-process contra DB + auth reales) viven en test/integration/ y se
// excluyen acá; se corren con `pnpm test:integration`.
export default defineConfig({
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', '**/test/integration/**'],
  },
});
