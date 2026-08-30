import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const bundle = await readFile(
  path.join(process.cwd(), 'packages/pixel/dist/pixel.min.js'),
  'utf8',
);

const collectorEndpoint = 'http://127.0.0.1:8790/v1/events';
const pipelineBaseUrl = 'http://127.0.0.1:8790';
const clickHouseUrl = 'http://127.0.0.1:8123';

async function clickHouseCommand(query: string): Promise<string> {
  const endpoint = new URL(clickHouseUrl);
  endpoint.searchParams.set('query', query);

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization:
        'Basic ' +
        Buffer.from(
          `default:${process.env.CLICKHOUSE_PASSWORD ?? ''}`,
        ).toString('base64'),
    },
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return (await response.text()).trim();
}

async function openFixture(page: Page) {
  await page.goto(
    'http://shop.localhost:4173/?utm_source=meta&utm_campaign=pipeline&fbclid=abc',
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
    { source: bundle, endpoint: collectorEndpoint },
  );
}

async function flush(page: Page) {
  await page.evaluate(async () => {
    await window.funnelAnalytics?.flush();
  });
}

test.beforeEach(async () => {
  await clickHouseCommand('TRUNCATE TABLE funnel_analytics.events');
});

test('page_view crosses Collector, Queue, Event Worker, R2 and ClickHouse', async ({
  page,
}) => {
  const statuses: number[] = [];
  page.on('response', (response) => {
    if (response.url() === collectorEndpoint) {
      statuses.push(response.status());
    }
  });

  await openFixture(page);
  await injectPixel(page);
  await flush(page);

  await expect.poll(() => statuses).toContain(202);

  await expect
    .poll(async () =>
      Number(
        await clickHouseCommand(
          "SELECT count() FROM funnel_analytics.events FINAL WHERE event_name = 'page_view'",
        ),
      ),
    )
    .toBe(1);

  const raw = await fetch(`${pipelineBaseUrl}/__test/raw-list`).then(
    (response) => response.json() as Promise<{ count: number }>,
  );

  expect(raw.count).toBeGreaterThan(0);
});

test('SPA landing to checkout becomes two page_views in ClickHouse', async ({
  page,
}) => {
  await openFixture(page);
  await injectPixel(page);
  await flush(page);

  await page.evaluate(async () => {
    history.pushState({}, '', '/checkout');
    await new Promise((resolve) => setTimeout(resolve, 0));
    await window.funnelAnalytics?.flush();
  });

  await expect
    .poll(async () =>
      Number(
        await clickHouseCommand(
          "SELECT count() FROM funnel_analytics.events FINAL WHERE event_name = 'page_view'",
        ),
      ),
    )
    .toBe(2);
});

test('duplicate Queue delivery is one logical ClickHouse event', async () => {
  const duplicatedEventId = '018bcfe5-6800-7000-8000-000000000099';
  const body = {
    envelope_version: 1,
    request_id: '550e8400-e29b-41d4-a716-446655440099',
    received_at: '2026-08-30T04:00:00.000Z',
    collector_version: '0.1.0',
    workspace_id: '21000000-0000-0000-0000-000000000001',
    pixel_id: '31000000-0000-0000-0000-000000000001',
    origin_host: 'shop.localhost',
    source: 'browser',
    events: [
      {
        event_id: duplicatedEventId,
        event_name: 'page_view',
        event_version: 1,
        sdk_version: '0.2.0',
        pixel_key: 'px_pub_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        visitor_id: '018bcfe5-6800-7000-8000-000000000002',
        session_id: '018bcfe5-6800-7000-8000-000000000003',
        occurred_at: '2026-08-30T03:59:59.000Z',
        page_url: 'http://shop.localhost:4173/',
        page_path: '/',
        page_title: 'Fixture',
        referrer: null,
        referrer_domain: null,
        utm_source: null,
        utm_medium: null,
        utm_campaign: null,
        utm_content: null,
        utm_term: null,
        click_ids: {},
        device: { type: 'desktop' },
        browser: { name: 'Chrome' },
        os: { name: 'Linux' },
        screen: {
          width: 1280,
          height: 720,
          device_pixel_ratio: 1,
        },
        viewport: { width: 1280, height: 720 },
        language: 'pt-BR',
        timezone: 'America/Sao_Paulo',
        consent_state: 'granted',
        test_mode: true,
      },
    ],
  };

  const response = await fetch(`${pipelineBaseUrl}/__test/duplicate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  expect(response.status).toBe(202);

  await expect
    .poll(async () =>
      Number(
        await clickHouseCommand(
          `SELECT count() FROM funnel_analytics.events FINAL WHERE event_id = toUUID('${duplicatedEventId}')`,
        ),
      ),
    )
    .toBe(1);
});
