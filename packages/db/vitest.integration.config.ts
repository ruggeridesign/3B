import { defineConfig } from 'vitest/config';

// Tests de integración: golpean la DB real (requieren `pnpm db:up` + seed).
export default defineConfig({
  test: {
    include: ['test/integration/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
