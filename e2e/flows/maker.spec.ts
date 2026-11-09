import { expect, test } from '@playwright/test';
import { storage } from '../roles';

test.use({ storageState: storage('lucia') });

test('Maker ve su home y entra al catálogo "Comprar"', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { level: 1, name: /^Hola,/ }),
  ).toBeVisible();

  await page.getByRole('link', { name: 'Comprar' }).first().click();
  await expect(page).toHaveURL(/\/comprar/);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Comprar' }),
  ).toBeVisible();
});
