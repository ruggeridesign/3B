import { defineConfig } from 'vitest/config';

// Tests de integración de core (requieren DB real con seed).
export default defineConfig({
  test: {
    include: ['test/integration/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
