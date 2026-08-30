import { expect, test } from '@playwright/test';

const password = 'Prisma-Test-2026!';

async function signUp(
  page: import('@playwright/test').Page,
  {
    name,
    email,
  }: {
    name: string;
    email: string;
  },
) {
  await page.goto('/sign-up');
  await page.getByLabel('Nome').fill(name);
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill(password);
  await page.getByRole('button', { name: 'Criar conta' }).click();
}

async function createWorkspace(
  page: import('@playwright/test').Page,
  name: string,
) {
  await expect(
    page.getByRole('heading', { name: 'Crie seu Workspace' }),
  ).toBeVisible();
  await page.getByLabel('Nome da empresa / Workspace').fill(name);
  await page.getByRole('button', { name: 'Criar Workspace' }).click();
  await expect(page.getByRole('heading', { name })).toBeVisible();
}

test('signup → onboarding → workspace → dashboard', async ({ page }) => {
  const suffix = Date.now().toString(36);
  await signUp(page, {
    name: 'Owner E2E',
    email: `owner-${suffix}@example.test`,
  });
  await createWorkspace(page, `Workspace Signup ${suffix}`);

  await expect(page.getByText('owner')).toBeVisible();
  await expect(page).toHaveURL(/\/app$/);
});

test('owner invites a user and the user accepts the workspace', async ({
  browser,
}) => {
  const suffix = Date.now().toString(36);
  const workspaceName = `Workspace Invite ${suffix}`;
  const inviteeEmail = `invitee-${suffix}@example.test`;

  const ownerContext = await browser.newContext();
  const ownerPage = await ownerContext.newPage();

  await signUp(ownerPage, {
    name: 'Owner Invite E2E',
    email: `invite-owner-${suffix}@example.test`,
  });
  await createWorkspace(ownerPage, workspaceName);
  await ownerPage.goto('/app/settings/members');

  await ownerPage.getByLabel('E-mail').fill(inviteeEmail);
  await ownerPage.getByLabel('Role').selectOption('viewer');
  await ownerPage.getByRole('button', { name: 'Convidar' }).click();

  const invitationLink = await ownerPage
    .getByTestId('invitation-link')
    .inputValue();

  expect(invitationLink).toContain('/invite/');
  await ownerContext.close();

  const inviteeContext = await browser.newContext();
  const inviteePage = await inviteeContext.newPage();
  await inviteePage.goto(invitationLink);

  await expect(inviteePage.getByRole('heading', { name: workspaceName })).toBeVisible();
  await inviteePage.getByRole('link', { name: 'Criar conta' }).click();

  await inviteePage.getByLabel('Nome').fill('Invitee E2E');
  await inviteePage.getByLabel('E-mail').fill(inviteeEmail);
  await inviteePage.getByLabel('Senha').fill(password);
  await inviteePage.getByRole('button', { name: 'Criar conta' }).click();

  await expect(inviteePage.getByRole('heading', { name: workspaceName })).toBeVisible();
  await inviteePage.getByRole('button', { name: 'Aceitar convite' }).click();

  await expect(inviteePage.getByRole('heading', { name: workspaceName })).toBeVisible();
  await expect(inviteePage.getByText('viewer')).toBeVisible();
  await expect(inviteePage).toHaveURL(/\/app$/);

  await inviteeContext.close();
});
