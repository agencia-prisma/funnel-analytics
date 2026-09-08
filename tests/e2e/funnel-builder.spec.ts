import { expect, test } from '@playwright/test';

const password = 'Prisma-Test-2026!';

async function signUp(page: import('@playwright/test').Page, suffix: string) {
  await page.goto('/sign-up');
  await page.getByLabel('Nome').fill('Funnel Builder E2E');
  await page.getByLabel('E-mail').fill(`funnel-${suffix}@example.test`);
  await page.getByLabel('Senha').fill(password);
  await page.getByRole('button', { name: 'Criar conta' }).click();
}

async function createWorkspace(
  page: import('@playwright/test').Page,
  suffix: string,
) {
  await expect(
    page.getByRole('heading', { name: 'Crie seu Workspace' }),
  ).toBeVisible();
  await page
    .getByLabel('Nome da empresa / Workspace')
    .fill(`Workspace Funnel ${suffix}`);
  await page.getByRole('button', { name: 'Criar Workspace' }).click();
  await expect(page).toHaveURL(/\/app$/);
}

test('owner configures rules, publishes a funnel, and reloads the immutable version', async ({
  page,
}) => {
  const suffix = Date.now().toString(36);
  await signUp(page, suffix);
  await createWorkspace(page, suffix);

  await page.goto('/app/funnels');
  await expect(page.getByRole('heading', { name: 'Funnels' })).toBeVisible();
  await page.getByRole('link', { name: 'Novo Funnel' }).click();

  await expect(
    page.getByRole('heading', { name: 'Novo Funnel' }),
  ).toBeVisible();
  await page.getByLabel('Nome', { exact: true }).fill(`Checkout ${suffix}`);

  await page.getByLabel('Campo').selectOption('page_path');
  await page.getByLabel('Operador').selectOption('contains');
  await page.getByLabel('Valor', { exact: true }).fill('/oferta');

  await page.getByRole('button', { name: 'Publicar' }).click();
  await expect(
    page.getByRole('heading', { name: 'Publicar nova versão?' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Confirmar publicação' }).click();

  await expect(page).toHaveURL(/\/app\/funnels\/[0-9a-f-]+/);
  await expect(page.getByText('Versão ativa 1')).toBeVisible();
  await expect(page.getByText('2 etapas')).toBeVisible();

  await page.reload();
  await expect(
    page.getByRole('heading', { name: `Checkout ${suffix}` }),
  ).toBeVisible();
  await expect(page.getByText('Base v1')).toBeVisible();
  await expect(page.getByLabel('Valor', { exact: true })).toHaveValue(
    '/oferta',
  );
});
