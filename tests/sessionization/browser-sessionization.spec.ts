import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const bundle = await readFile(
  path.join(process.cwd(), 'packages/pixel/dist/pixel.min.js'),
  'utf8',
);

const collectorEndpoint = 'http://127.0.0.1:8791/v1/events';
const sessionizationBaseUrl = 'http://127.0.0.1:8791';
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
    'http://shop.localhost:4173/?utm_source=meta&utm_campaign=sessionization&fbclid=abc',
  );
}

async function injectPixel(page: Page) {
  await page.evaluate(
    ({ source, endpoint }) => {
      const script = document.createElement('script');
      script.dataset.pixelId =
        'px_pub_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
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

function uuidV7At(timestamp: string, suffix: number): string {
  const milliseconds = Date.parse(timestamp);
  const prefix = BigInt(milliseconds).toString(16).padStart(12, '0');

  return `${prefix.slice(0, 8)}-${prefix.slice(8, 12)}-7000-8000-${String(
    suffix,
  ).padStart(12, '0')}`;
}

function collectorEnvelope(input: {
  requestId: string;
  eventId: string;
  visitorId: string;
  sessionId: string;
  occurredAt: string;
  receivedAt: string;
}) {
  return {
    envelope_version: 1,
    request_id: input.requestId,
    received_at: input.receivedAt,
    collector_version: '0.1.0',
    workspace_id: '21000000-0000-0000-0000-000000000001',
    pixel_id: '31000000-0000-0000-0000-000000000001',
    origin_host: 'shop.localhost',
    source: 'browser',
    events: [
      {
        event_id: input.eventId,
        event_name: 'page_view',
        event_version: 1,
        sdk_version: '0.2.0',
        pixel_key: 'px_pub_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        visitor_id: input.visitorId,
        session_id: input.sessionId,
        occurred_at: input.occurredAt,
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
}

test.beforeEach(async () => {
  await clickHouseCommand('TRUNCATE TABLE funnel_analytics.events');
  await clickHouseCommand('TRUNCATE TABLE funnel_analytics.session_facts');
});

test('SPA landing and checkout become one session with two page views', async ({
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
      clickHouseCommand(
        `SELECT concat(
          toString(count()),
          '|',
          toString(ifNull(any(page_view_count), 0)),
          '|',
          ifNull(any(landing_page_path), ''),
          '|',
          ifNull(any(exit_page_path), '')
        )
        FROM funnel_analytics.session_facts_current`,
      ),
    )
    .toBe('1|2|/|/checkout');
});

test('duplicate event delivery does not inflate the session snapshot', async () => {
  const body = collectorEnvelope({
    requestId: '550e8400-e29b-41d4-a716-446655440099',
    eventId: uuidV7At('2026-08-31T10:00:00.000Z', 99),
    visitorId: uuidV7At('2026-08-31T09:59:00.000Z', 2),
    sessionId: uuidV7At('2026-08-31T10:00:00.000Z', 3),
    occurredAt: '2026-08-31T10:00:00.000Z',
    receivedAt: '2026-08-31T10:00:01.000Z',
  });

  const response = await fetch(`${sessionizationBaseUrl}/__test/duplicate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  expect(response.status).toBe(202);

  await expect
    .poll(async () =>
      clickHouseCommand(
        `SELECT concat(
          toString(count()),
          '|',
          toString(ifNull(any(event_count), 0))
        )
        FROM funnel_analytics.session_facts_current`,
      ),
    )
    .toBe('1|1');
});

test('two SDK-style session IDs more than 30 minutes apart create two facts', async () => {
  const visitorId = uuidV7At('2026-08-31T09:59:00.000Z', 20);
  const firstSessionId = uuidV7At('2026-08-31T10:00:00.000Z', 21);
  const secondSessionId = uuidV7At('2026-08-31T10:31:00.000Z', 22);

  const first = collectorEnvelope({
    requestId: '550e8400-e29b-41d4-a716-446655440101',
    eventId: uuidV7At('2026-08-31T10:00:00.000Z', 101),
    visitorId,
    sessionId: firstSessionId,
    occurredAt: '2026-08-31T10:00:00.000Z',
    receivedAt: '2026-08-31T10:00:01.000Z',
  });
  const second = collectorEnvelope({
    requestId: '550e8400-e29b-41d4-a716-446655440102',
    eventId: uuidV7At('2026-08-31T10:31:00.000Z', 102),
    visitorId,
    sessionId: secondSessionId,
    occurredAt: '2026-08-31T10:31:00.000Z',
    receivedAt: '2026-08-31T10:31:01.000Z',
  });

  for (const body of [first, second]) {
    const response = await fetch(
      `${sessionizationBaseUrl}/__test/enqueue`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      },
    );
    expect(response.status).toBe(202);
  }

  await expect
    .poll(async () =>
      clickHouseCommand(
        `SELECT concat(
          toString(count()),
          '|',
          toString(uniqExact(visitor_id))
        )
        FROM funnel_analytics.session_facts_current`,
      ),
    )
    .toBe('2|1');
});
