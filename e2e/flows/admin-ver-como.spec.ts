import { expect, test } from '@playwright/test';
import { storage } from '../roles';

test.use({ storageState: storage('admin') });

test('Admin cambia de interfaz con "Ver como" y vuelve a su cuenta', async ({
  page,
}) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { level: 1, name: /Hola, Admin/ }),
  ).toBeVisible();

  // Abrir el selector y elegir el rol Mover (impersona a un Mover del seed).
  await page.getByRole('button', { name: 'Ver como' }).click();
  await page.getByRole('menuitem', { name: /Mover/ }).click();

  // La interfaz cambió: banner de impersonación + espacio "Mover" en el navbar.
  await expect(page.getByText(/Estás viendo como/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Mover' })).toBeVisible();

  // Volver a la cuenta real del admin.
  await page.getByRole('button', { name: /Volver a tu cuenta/ }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: /Hola, Admin/ }),
  ).toBeVisible();
});
