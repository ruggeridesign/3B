import { expect, test } from '@playwright/test';
import { DEV_PASSWORD } from '../roles';

// Sin sesión: anulamos cualquier storageState.
test.use({ storageState: { cookies: [], origins: [] } });

test('sin sesión, visitar / redirige a /login', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login/);
  await expect(
    page.getByRole('heading', { name: /Entrar a 3B/ }),
  ).toBeVisible();
});

test('login por la UI lleva a la home', async ({ page }) => {
  await page.goto('/login');
  await page.fill('#email', 'lucia@3b.test');
  await page.fill('#password', DEV_PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: /^Hola,/ }),
  ).toBeVisible();
});
