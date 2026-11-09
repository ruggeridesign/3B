import { defineConfig, devices } from '@playwright/test';

/**
 * E2E de 3B: maneja Chromium contra la app real (web :3000 + api :8787 + DB).
 * Requiere la DB levantada y **sembrada** (`pnpm db:up` + `pnpm db:reset`).
 * `webServer` levanta api+web; en local reusa los que ya estén corriendo.
 *
 * El proyecto `setup` loguea cada usuario del seed y guarda su sesión
 * (`storageState` en `e2e/.auth/<rol>.json`); los specs de `flows/` la reusan.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list']],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      testMatch: /flows\/.*\.spec\.ts/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'pnpm --filter @3b/api dev',
      url: 'http://localhost:8787/',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: 'ignore',
    },
    {
      command: 'pnpm --filter @3b/web dev',
      url: 'http://localhost:3000/login',
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      stdout: 'ignore',
    },
  ],
});
