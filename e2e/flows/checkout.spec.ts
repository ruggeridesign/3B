import { expect, test } from '@playwright/test';
import { storage } from '../roles';

test.use({ storageState: storage('lucia') });

// Ítem comprable del seed (Ferretería, Coro): tiene variantes con stock y Lucía
// (Maker en Coro) lo ve en el catálogo.
const ITEM = 'Taladro percutor 650W';

test('Maker: checkout completo (catálogo → carrito → pedido en "Mis pedidos")', async ({
  page,
}) => {
  // 1) Catálogo → ficha del ítem.
  await page.goto('/comprar');
  await page
    .getByRole('link', { name: new RegExp(ITEM) })
    .first()
    .click();
  await expect(
    page.getByRole('heading', { level: 1, name: ITEM }),
  ).toBeVisible();

  // 2) Agregar una variante al carrito (el contador del navbar sube a 1).
  await page.getByRole('button', { name: 'Agregar' }).first().click();
  await expect(page.getByRole('link', { name: /Carrito \(1\)/ })).toBeVisible();

  // 3) Ir al carrito y confirmar; capturar el pedido creado desde la API.
  await page.getByRole('link', { name: /Carrito/ }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Carrito' }),
  ).toBeVisible();
  const [resp] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes('/v1/orders') && r.request().method() === 'POST',
    ),
    page.getByRole('button', { name: 'Confirmar pedido' }).click(),
  ]);
  expect([200, 201]).toContain(resp.status());
  const order = (await resp.json()) as { number: number; status: string };
  expect(order.status).toBe('realizado');

  // 4) La confirmación se muestra y PERSISTE aunque el carrito quede vacío.
  await expect(
    page.getByText(new RegExp(`Pedido\\s+#${order.number}\\s+realizado`)),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: /Ver pedido/ })).toBeVisible();

  // 5) El pedido recién creado aparece en "Mis pedidos".
  await page.goto('/comprar/pedidos');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Mis pedidos' }),
  ).toBeVisible();
  // El número pega con el badge de estado ("Pedido #1046Realizado"); el lookahead
  // evita que, p. ej., #104 matchee a #1046.
  await expect(
    page.getByRole('link', {
      name: new RegExp(`Pedido #${order.number}(?!\\d)`),
    }),
  ).toBeVisible();
});
