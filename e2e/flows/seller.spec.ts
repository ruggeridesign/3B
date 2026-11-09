import { expect, test } from '@playwright/test';
import { storage } from '../roles';

test.use({ storageState: storage('carlos') });

test('Seller ve "Mi Tienda" con al menos una tienda', async ({ page }) => {
  await page.goto('/mi-tienda');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Mi Tienda' }),
  ).toBeVisible();
  // Carlos es dueño de tiendas en el seed: debe listar al menos una.
  await expect(page.locator('a[href^="/mi-tienda/"]').first()).toBeVisible();
});
