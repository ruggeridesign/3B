import { expect, test } from '@playwright/test';
import { storage } from '../roles';

test.use({ storageState: storage('ana') });

test('Admin de comunidad ve el panel (no lo redirige)', async ({ page }) => {
  await page.goto('/comunidad');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Comunidad' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: /Cobros por confirmar/ }),
  ).toBeVisible();
});
