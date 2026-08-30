import { expect, test } from '@playwright/test';

test('access foundation page and health endpoint are available', async ({
  page,
}) => {
  await page.goto('/');

  await expect(
    page.getByRole('heading', { name: 'Funnel Analytics' }),
  ).toBeVisible();
  await expect(page.getByText('Funnel Analytics · Access Layer')).toBeVisible();

  const healthResponse = await page.request.get('/api/health');
  expect(healthResponse.ok()).toBe(true);
  await expect(healthResponse.json()).resolves.toMatchObject({
    service: 'web',
    status: 'ok',
    version: '0.1.0',
  });
});
