import { expect, test as setup } from '@playwright/test';
import { CREDS, DEV_PASSWORD, storage } from './roles';

// Loguea cada usuario del seed por la UI y guarda su sesión para los specs.
for (const { role, email } of CREDS) {
  setup(`autenticar ${role}`, async ({ page }) => {
    await page.goto('/login');
    await page.fill('#email', email);
    await page.fill('#password', DEV_PASSWORD);
    await page.getByRole('button', { name: 'Entrar' }).click();
    // Al entrar, la home saluda "Hola, <nombre>".
    await expect(
      page.getByRole('heading', { level: 1, name: /^Hola,/ }),
    ).toBeVisible();
    await page.context().storageState({ path: storage(role) });
  });
}
