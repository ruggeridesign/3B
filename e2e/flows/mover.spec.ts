import { expect, test } from '@playwright/test';
import { storage } from '../roles';

test.use({ storageState: storage('pedro') });

test('Mover ve su área con la cola de solicitudes', async ({ page }) => {
  await page.goto('/mover');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Mover' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: /Solicitudes abiertas/ }),
  ).toBeVisible();
});
