import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const pixelBundle = await readFile(
  path.join(process.cwd(), 'packages/pixel/dist/pixel.min.js'),
  'utf8',
);
const collectorEndpoint = 'http://127.0.0.1:8787/v1/events';

async function openSite(page: Page) {
  await page.goto(
    'http://shop.localhost:4173/?utm_source=meta&utm_campaign=collector&fbclid=abc',
  );
}

async function injectPixel(page: Page) {
  await page.evaluate(
    ({ source, endpoint }) => {
      const script = document.createElement('script');
      script.dataset.pixelId = 'px_pub_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
      script.dataset.endpoint = endpoint;
      script.textContent = source;
      document.head.appendChild(script);
    },
    { source: pixelBundle, endpoint: collectorEndpoint },
  );
}

test('pixel.js → HttpTransport → local Worker → local Queue → 202', async ({
  page,
}) => {
  const statuses: number[] = [];

  page.on('response', (response) => {
    if (response.url() === collectorEndpoint) {
      statuses.push(response.status());
    }
  });

  await openSite(page);
  await injectPixel(page);

  await page.evaluate(async () => {
    await window.funnelAnalytics?.flush();
  });

  await expect.poll(() => statuses).toContain(202);

  const ids = await page.evaluate(() => ({
    visitor: window.funnelAnalytics?.getVisitorId(),
    session: window.funnelAnalytics?.getSessionId(),
  }));

  expect(ids.visitor).toMatch(/-7[0-9a-f]{3}-/i);
  expect(ids.session).toMatch(/-7[0-9a-f]{3}-/i);
});

test('SPA landing and checkout both reach the Collector', async ({ page }) => {
  const statuses: number[] = [];

  page.on('response', (response) => {
    if (response.url() === collectorEndpoint) {
      statuses.push(response.status());
    }
  });

  await openSite(page);
  await injectPixel(page);

  await page.evaluate(async () => {
    await window.funnelAnalytics?.flush();
    history.pushState({}, '', '/checkout');
    await new Promise((resolve) => setTimeout(resolve, 0));
    await window.funnelAnalytics?.flush();
  });

  await expect
    .poll(() => statuses.filter((status) => status === 202).length)
    .toBe(2);
});
