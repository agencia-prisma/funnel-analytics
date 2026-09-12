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

async function openFirstStepDialog(page: import('@playwright/test').Page) {
  await page.locator('.react-flow__node-funnelStep').first().click();
  await expect(
    page.getByRole('heading', { name: /Configurar Landing Page/ }),
  ).toBeVisible();
}

test('owner configures a human-friendly rule, publishes a funnel, and reloads the immutable version', async ({
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

  await page.getByRole('button', { name: 'Configurar funil' }).click();
  await expect(
    page.getByRole('heading', { name: 'Configurações do funil' }),
  ).toBeVisible();
  await page.getByLabel('Nome', { exact: true }).fill(`Checkout ${suffix}`);
  await page.getByRole('button', { name: 'Concluir' }).click();

  await openFirstStepDialog(page);
  await expect(page.getByLabel('Ação da etapa')).toHaveValue('page_view');
  await page.getByLabel('Adicionar condição').selectOption('page_path');
  await page.getByLabel('Valor da condição 1').fill('/oferta');
  await page.getByRole('button', { name: 'Concluir edição' }).click();

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

  await openFirstStepDialog(page);
  await expect(page.getByLabel('Valor da condição 1')).toHaveValue('/oferta');
});
