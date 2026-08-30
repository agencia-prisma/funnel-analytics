import { expect, test, type Page } from '@playwright/test';

const password = 'Prisma-Test-2026!';

async function signUp(
  page: Page,
  { name, email }: { name: string; email: string },
) {
  await page.goto('/sign-up');
  await page.getByLabel('Nome').fill(name);
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill(password);
  await page.getByRole('button', { name: 'Criar conta' }).click();
}

async function createWorkspace(page: Page, name: string) {
  await expect(
    page.getByRole('heading', { name: 'Crie seu Workspace' }),
  ).toBeVisible();
  await page.getByLabel('Nome da empresa / Workspace').fill(name);
  await page.getByRole('button', { name: 'Criar Workspace' }).click();
  await expect(page.getByRole('heading', { name })).toBeVisible();
}

async function createPixel(page: Page, name: string) {
  await page.goto('/app/pixels');
  await page.getByLabel('Nome').fill(name);
  await page
    .getByLabel(/Domínio inicial/)
    .fill('https://www.example.com/checkout?utm_source=e2e#buy');
  await page.getByRole('button', { name: 'Criar Pixel' }).click();
  await expect(page.getByRole('heading', { name })).toBeVisible();
}

test('Owner creates and manages a Pixel control plane', async ({ page }) => {
  const suffix = Date.now().toString(36);
  const pixelName = `Site Principal ${suffix}`;

  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await signUp(page, {
    name: 'Pixel Owner E2E',
    email: `pixel-owner-${suffix}@example.test`,
  });
  await createWorkspace(page, `Pixel Workspace ${suffix}`);
  await createPixel(page, pixelName);

  const publicKey = page.getByTestId('pixel-public-key');
  await expect(publicKey).toHaveText(/^px_pub_[0-9a-f]{36}$/);
  await expect(
    page.getByText('www.example.com', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Aguardando instalação / primeiro evento.'),
  ).toBeVisible();

  const snippet = page.getByTestId('installation-snippet');
  await expect(snippet).toContainText('cdn.DOMINIO-FUTURO.com/pixel.js');
  await expect(snippet).toContainText('data-pixel-id="px_pub_');
  await expect(
    page.getByText(
      'Código preparado — ativação do coletor entra na próxima etapa.',
    ),
  ).toBeVisible();

  await page.getByTestId('copy-public-key').click();
  await expect(page.getByTestId('copy-public-key')).toHaveText('Copiado');

  await page.getByLabel('Nome').fill(`Site Editado ${suffix}`);
  await page.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(
    page.getByRole('heading', { name: `Site Editado ${suffix}` }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Pausar Pixel' }).click();
  await expect(page.getByText('paused', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Reativar Pixel' }).click();
  await expect(page.getByText('active', { exact: true })).toBeVisible();
});

test('Viewer can view Pixels but cannot mutate them', async ({ browser }) => {
  const suffix = Date.now().toString(36);
  const workspaceName = `Viewer Workspace ${suffix}`;
  const pixelName = `Viewer Pixel ${suffix}`;
  const viewerEmail = `pixel-viewer-${suffix}@example.test`;

  const ownerContext = await browser.newContext();
  const ownerPage = await ownerContext.newPage();

  await signUp(ownerPage, {
    name: 'Viewer Flow Owner',
    email: `viewer-owner-${suffix}@example.test`,
  });
  await createWorkspace(ownerPage, workspaceName);
  await createPixel(ownerPage, pixelName);

  await ownerPage.goto('/app/settings/members');
  await ownerPage.getByLabel('E-mail').fill(viewerEmail);
  await ownerPage.getByLabel('Role').selectOption('viewer');
  await ownerPage.getByRole('button', { name: 'Convidar' }).click();

  const invitationLink = await ownerPage
    .getByTestId('invitation-link')
    .inputValue();
  await ownerContext.close();

  const viewerContext = await browser.newContext();
  const viewerPage = await viewerContext.newPage();

  await viewerPage.goto(invitationLink);
  await viewerPage.getByRole('link', { name: 'Criar conta' }).click();
  await viewerPage.getByLabel('Nome').fill('Pixel Viewer E2E');
  await viewerPage.getByLabel('E-mail').fill(viewerEmail);
  await viewerPage.getByLabel('Senha').fill(password);
  await viewerPage.getByRole('button', { name: 'Criar conta' }).click();
  await viewerPage.getByRole('button', { name: 'Aceitar convite' }).click();

  await viewerPage.goto('/app/pixels');
  await expect(viewerPage.getByText(pixelName, { exact: true })).toBeVisible();
  await expect(
    viewerPage.getByRole('button', { name: 'Criar Pixel' }),
  ).toHaveCount(0);

  await viewerPage.getByRole('link', { name: 'Abrir Pixel' }).click();
  await expect(
    viewerPage.getByRole('heading', { name: pixelName }),
  ).toBeVisible();
  await expect(
    viewerPage.getByRole('button', { name: 'Salvar alterações' }),
  ).toHaveCount(0);
  await expect(
    viewerPage.getByRole('button', { name: 'Pausar Pixel' }),
  ).toHaveCount(0);
  await expect(
    viewerPage.getByRole('button', { name: 'Arquivar Pixel' }),
  ).toHaveCount(0);
  await expect(
    viewerPage.getByRole('button', { name: 'Adicionar' }),
  ).toHaveCount(0);

  await viewerContext.close();
});
