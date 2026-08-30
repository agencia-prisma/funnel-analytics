import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const bundle = await readFile(
  path.join(process.cwd(), 'packages/pixel/dist/pixel.min.js'),
  'utf8',
);

async function injectPixel(page: import('@playwright/test').Page) {
  await page.evaluate(
    ({ source }) => {
      const script = document.createElement('script');
      script.dataset.pixelId = 'px_pub_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
      script.dataset.endpoint = 'http://collector.localhost:8787/v1/events';
      script.textContent = source;
      document.head.appendChild(script);
    },
    { source: bundle },
  );
}

test('pixel.js HttpTransport reaches local Worker and Queue path', async ({
  page,
}) => {
  const failedRequests: string[] = [];
  page.on('requestfailed', (request) => {
    failedRequests.push(
      `${request.method()} ${request.url()} :: ${request.failure()?.errorText ?? 'unknown'}`,
    );
  });

  await page.goto(
    'http://shop.localhost:4173/?utm_source=meta&utm_campaign=collector&fbclid=abc',
  );

  const firstResponse = page.waitForResponse(
    (response) =>
      response.url() === 'http://collector.localhost:8787/v1/events' &&
      response.request().method() === 'POST',
  );

  await injectPixel(page);
  await page.evaluate(async () => {
    await (
      window as typeof window & {
        funnelAnalytics?: { flush(): Promise<boolean> };
      }
    ).funnelAnalytics?.flush();
  });

  const accepted = await firstResponse;
  expect(accepted.status()).toBe(202);
  await expect(accepted.json()).resolves.toMatchObject({
    accepted: true,
    event_count: 1,
  });

  const firstPayload = JSON.parse(accepted.request().postData() ?? '{}') as {
    events?: Array<{
      event_name?: string;
      page_path?: string;
      utm_source?: string | null;
      utm_campaign?: string | null;
      click_ids?: Record<string, string>;
    }>;
  };

  expect(firstPayload.events?.[0]).toMatchObject({
    event_name: 'page_view',
    page_path: '/',
    utm_source: 'meta',
    utm_campaign: 'collector',
    click_ids: { fbclid: 'abc' },
  });

  const secondResponse = page.waitForResponse(
    (response) =>
      response.url() === 'http://collector.localhost:8787/v1/events' &&
      response.request().method() === 'POST',
  );

  await page.evaluate(() => {
    history.pushState({}, '', '/checkout');
  });
  await page.evaluate(async () => {
    await (
      window as typeof window & {
        funnelAnalytics?: { flush(): Promise<boolean> };
      }
    ).funnelAnalytics?.flush();
  });

  const spaAccepted = await secondResponse;
  expect(spaAccepted.status()).toBe(202);

  const spaPayload = JSON.parse(spaAccepted.request().postData() ?? '{}') as {
    events?: Array<{
      event_name?: string;
      page_path?: string;
      utm_source?: string | null;
    }>;
  };

  expect(spaPayload.events?.[0]).toMatchObject({
    event_name: 'page_view',
    page_path: '/checkout',
    utm_source: 'meta',
  });
});
