import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const bundle = await readFile(
  path.join(process.cwd(), 'packages/pixel/dist/pixel.min.js'),
  'utf8',
);
const fixture = await readFile(
  path.join(process.cwd(), 'tests/fixtures/pixel.html'),
  'utf8',
);

async function openFixture(
  page: Page,
  url = 'https://example.test/',
  referer?: string,
) {
  await page.route('https://example.test/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: fixture,
    }),
  );

  await page.goto(url, referer ? { referer } : undefined);
}

async function injectPixel(
  page: Page,
  options: {
    pixelId?: string;
    testMode?: boolean;
    consentRequired?: boolean;
    endpoint?: string;
    debug?: boolean;
  } = {},
) {
  return page.evaluate(
    ({ source, options }) => {
      const startedAt = performance.now();
      const script = document.createElement('script');
      script.dataset.pixelId =
        options.pixelId ?? 'px_pub_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

      if (options.testMode ?? true) {
        script.dataset.testMode = 'true';
      }

      if (options.consentRequired) {
        script.dataset.consentRequired = 'true';
      }

      if (options.endpoint) {
        script.dataset.endpoint = options.endpoint;
      }

      if (options.debug) {
        script.dataset.debug = 'true';
      }

      script.textContent = source;
      document.head.appendChild(script);

      return performance.now() - startedAt;
    },
    { source: bundle, options },
  );
}

async function flush(page: Page) {
  await page.evaluate(async () => {
    await window.funnelAnalytics?.flush();
  });
}

async function events(page: Page) {
  return page.evaluate(() =>
    (window.__funnelAnalyticsTestBatches ?? []).flatMap(
      (batch) => batch.events,
    ),
  );
}

test('pixel.js creates ids, page_view and keeps session attribution in SPA navigation', async ({
  page,
}) => {
  await openFixture(
    page,
    'https://example.test/?utm_source=meta&utm_campaign=teste&fbclid=abc',
    'https://facebook.com/post',
  );
  const bootstrapMs = await injectPixel(page);
  expect(bootstrapMs).toBeLessThan(100);

  const initialIds = await page.evaluate(() => ({
    visitor: window.funnelAnalytics?.getVisitorId(),
    session: window.funnelAnalytics?.getSessionId(),
  }));

  expect(initialIds.visitor).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );
  expect(initialIds.session).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );

  await flush(page);

  let tracked = await events(page);
  expect(tracked).toHaveLength(1);
  expect(tracked[0]).toMatchObject({
    event_name: 'page_view',
    event_version: 1,
    sdk_version: '0.2.0',
    pixel_key: 'px_pub_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    utm_source: 'meta',
    utm_campaign: 'teste',
    click_ids: { fbclid: 'abc' },
    test_mode: true,
  });

  await page.evaluate(() => {
    history.pushState({}, '', '/checkout');
  });
  await expect(page).toHaveURL('https://example.test/checkout');
  await flush(page);

  tracked = await events(page);
  expect(tracked.at(-1)).toMatchObject({
    event_name: 'page_view',
    page_path: '/checkout',
    utm_source: 'meta',
    utm_campaign: 'teste',
    click_ids: { fbclid: 'abc' },
  });

  await page.evaluate(() => {
    history.replaceState({}, '', '/thank-you');
  });
  await expect(page).toHaveURL('https://example.test/thank-you');
  await flush(page);

  await page.goBack();
  await expect(page).toHaveURL(
    'https://example.test/?utm_source=meta&utm_campaign=teste&fbclid=abc',
  );
  await flush(page);

  tracked = await events(page);
  expect(
    tracked.filter((event) => event.event_name === 'page_view'),
  ).toHaveLength(4);
});

test('visitor and session persist across page reloads', async ({ page }) => {
  await openFixture(page);
  await injectPixel(page);

  const first = await page.evaluate(() => ({
    visitor: window.funnelAnalytics?.getVisitorId(),
    session: window.funnelAnalytics?.getSessionId(),
  }));

  await page.reload();
  await injectPixel(page);

  const second = await page.evaluate(() => ({
    visitor: window.funnelAnalytics?.getVisitorId(),
    session: window.funnelAnalytics?.getSessionId(),
  }));

  expect(second).toEqual(first);
});

test('duplicate script bootstraps once and creates one initial page_view', async ({
  page,
}) => {
  await openFixture(page);
  await injectPixel(page);
  await injectPixel(page);
  await flush(page);

  const tracked = await events(page);
  expect(
    tracked.filter((event) => event.event_name === 'page_view'),
  ).toHaveLength(1);
});

test('consent-required mode does not track before grant and stops after denial', async ({
  page,
}) => {
  await openFixture(page);
  await injectPixel(page, { consentRequired: true });

  await flush(page);
  expect(await events(page)).toHaveLength(0);

  await page.evaluate(() => {
    window.funnelAnalytics?.consent({ analytics: true });
  });
  await flush(page);

  expect(await events(page)).toHaveLength(1);

  const result = await page.evaluate(() => {
    window.funnelAnalytics?.consent({ analytics: false });
    return window.funnelAnalytics?.track('after_denial', { product: 'shoe' });
  });

  expect(result).toBe(false);
});

test('custom events remove PII and reserved fields', async ({ page }) => {
  await openFixture(page);
  await injectPixel(page);

  await page.evaluate(() => {
    window.funnelAnalytics?.track('cta_clicked', {
      product: 'shoe',
      email: 'person@example.com',
      password: 'secret',
      visitor_id: 'override',
      nested: {
        phone: '5511999999999',
        sku: 'ABC',
      },
    });
  });

  await flush(page);
  const tracked = await events(page);
  const custom = tracked.find((event) => event.event_name === 'custom_event');

  expect(custom).toMatchObject({
    event_name: 'custom_event',
    custom_event_name: 'cta_clicked',
    properties: {
      product: 'shoe',
      nested: {
        sku: 'ABC',
      },
    },
  });
});

test('transport failure never breaks the host page', async ({ page }) => {
  await openFixture(page);

  await page.route('https://collector.invalid/**', (route) => route.abort());
  await injectPixel(page, {
    testMode: false,
    endpoint: 'https://collector.invalid/events',
  });

  await page.evaluate(async () => {
    await window.funnelAnalytics?.flush();
  });

  await page.locator('#safe-button').click();
  await expect(page.locator('#safe-status')).toHaveText('clicked');
});
