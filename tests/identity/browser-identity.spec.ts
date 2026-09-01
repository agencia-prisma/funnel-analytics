import { ClickHouseIdentityLinkWriter } from '@funnel/clickhouse';
import type { IdentityEnvelopeV1 } from '@funnel/event-contracts';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

import { SupabaseIdentityRepository } from '../../apps/identity-worker/src/control-plane';
import { createIdentityConsumer } from '../../apps/identity-worker/src/consumer';
import path from 'node:path';

const bundle = await readFile(
  path.join(process.cwd(), 'packages/pixel/dist/pixel.min.js'),
  'utf8',
);

const collectorBaseUrl = 'http://127.0.0.1:8792';
const eventsEndpoint = `${collectorBaseUrl}/v1/events`;
const identityEndpoint = `${collectorBaseUrl}/v1/identify`;
const clickHouseUrl = 'http://127.0.0.1:8123';
const email = 'identity-e2e@example.com';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseSecretKey) {
  throw new Error('IDENTITY_E2E_SUPABASE_ENV_MISSING');
}

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

async function supabaseRows<T>(resource: string): Promise<T[]> {
  const response = await fetch(`${supabaseUrl}/rest/v1/${resource}`, {
    headers: {
      apikey: supabaseSecretKey,
      authorization: `Bearer ${supabaseSecretKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return (await response.json()) as T[];
}

async function injectPixel(
  page: Page,
  options: { consentRequired?: boolean } = {},
) {
  await page.evaluate(
    ({ source, eventUrl, identifyUrl, consentRequired }) => {
      const script = document.createElement('script');
      script.dataset.pixelId = 'px_pub_dddddddddddddddddddddddddddddddddddd';
      script.dataset.endpoint = eventUrl;
      script.dataset.identityEndpoint = identifyUrl;

      if (consentRequired) {
        script.dataset.consentRequired = 'true';
      }

      script.textContent = source;
      document.head.appendChild(script);
    },
    {
      source: bundle,
      eventUrl: eventsEndpoint,
      identifyUrl: identityEndpoint,
      consentRequired: options.consentRequired ?? false,
    },
  );
}

async function openIdentityContext(browser: Browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('http://shop.localhost:4173/');
  await injectPixel(page);
  await page.evaluate(async () => {
    await window.funnelAnalytics?.flush();
  });

  const visitorId = await page.evaluate(
    () => window.funnelAnalytics?.getVisitorId() ?? null,
  );
  const sessionId = await page.evaluate(
    () => window.funnelAnalytics?.getSessionId() ?? null,
  );

  expect(visitorId).toBeTruthy();
  expect(sessionId).toBeTruthy();

  return { context, page, visitorId: visitorId!, sessionId: sessionId! };
}

async function identify(page: Page, value = email) {
  return page.evaluate(
    async (emailValue) =>
      (await window.funnelAnalytics?.identify({
        email: emailValue,
      })) ?? false,
    value,
  );
}

async function personIdForVisitor(visitorId: string) {
  const rows = await supabaseRows<{ person_id: string }>(
    `person_visitor_links?workspace_id=eq.22000000-0000-0000-0000-000000000001&visitor_id=eq.${visitorId}&select=person_id`,
  );

  return rows[0]?.person_id ?? null;
}

async function processCapturedIdentityEnvelope(): Promise<IdentityEnvelopeV1> {
  const response = await fetch(`${collectorBaseUrl}/__test/identity-envelope`);

  expect(response.ok).toBe(true);

  const envelope = (await response.json()) as IdentityEnvelopeV1 | null;
  expect(envelope).not.toBeNull();

  let acked = false;
  let retried = false;
  const writer = new ClickHouseIdentityLinkWriter({
    url: clickHouseUrl,
    username: 'default',
    password: process.env.CLICKHOUSE_PASSWORD ?? '',
    database: 'funnel_analytics',
  });

  try {
    const consumeIdentity = createIdentityConsumer({
      repository: new SupabaseIdentityRepository(
        supabaseUrl!,
        supabaseSecretKey!,
      ),
      writer,
      dlq: {
        async send() {
          throw new Error('IDENTITY_E2E_UNEXPECTED_DLQ');
        },
      },
    });

    await consumeIdentity({
      messages: [
        {
          body: envelope!,
          attempts: 1,
          ack() {
            acked = true;
          },
          retry() {
            retried = true;
          },
        },
      ],
    });
  } finally {
    await writer.close();
  }

  expect(acked).toBe(true);
  expect(retried).toBe(false);

  return envelope!;
}

test.beforeEach(async () => {
  await clickHouseCommand('TRUNCATE TABLE funnel_analytics.events');
  await clickHouseCommand('TRUNCATE TABLE funnel_analytics.session_facts');
  await clickHouseCommand('TRUNCATE TABLE funnel_analytics.identity_links');
});

test('two browser visitors identify to one Person and historical sessions join without PII leakage', async ({
  browser,
}) => {
  const first = await openIdentityContext(browser);

  expect(await identify(first.page)).toBe(true);
  await processCapturedIdentityEnvelope();

  await expect.poll(() => personIdForVisitor(first.visitorId)).not.toBeNull();

  const firstPersonId = await personIdForVisitor(first.visitorId);
  expect(firstPersonId).toBeTruthy();

  const second = await openIdentityContext(browser);
  expect(second.visitorId).not.toBe(first.visitorId);
  expect(await identify(second.page)).toBe(true);
  await processCapturedIdentityEnvelope();

  await expect
    .poll(() => personIdForVisitor(second.visitorId))
    .toBe(firstPersonId);

  await expect
    .poll(() =>
      clickHouseCommand(
        `SELECT concat(
          toString(uniqExact(person_id)),
          '|',
          toString(uniqExact(visitor_id))
        )
        FROM funnel_analytics.identity_links_current
        WHERE workspace_id = '22000000-0000-0000-0000-000000000001'`,
      ),
    )
    .toBe('1|2');

  await expect
    .poll(() =>
      clickHouseCommand(
        `SELECT concat(
          toString(uniqExact(person_id)),
          '|',
          toString(uniqExact(session_id)),
          '|',
          toString(uniqExact(visitor_id))
        )
        FROM funnel_analytics.session_person_links
        WHERE workspace_id = '22000000-0000-0000-0000-000000000001'`,
      ),
    )
    .toBe('1|2|2');

  const envelopeResponse = await fetch(
    `${collectorBaseUrl}/__test/identity-envelope`,
  );
  const protectedEnvelope = JSON.stringify(await envelopeResponse.json());

  expect(protectedEnvelope).not.toContain(email);
  expect(protectedEnvelope).toContain('encrypted_identifiers');

  const rawResponse = await fetch(`${collectorBaseUrl}/__test/raw-contents`);
  const rawContents = JSON.stringify(await rawResponse.json());
  expect(rawContents).not.toContain(email);

  expect(
    await clickHouseCommand(
      `SELECT toString(countIf(position(toJSONString(properties), '${email}') > 0))
       FROM funnel_analytics.events FINAL`,
    ),
  ).toBe('0');

  const analyticsColumns = await clickHouseCommand(
    `SELECT arrayStringConcat(groupArray(name), ',')
     FROM system.columns
     WHERE database = 'funnel_analytics'
       AND table IN ('events', 'session_facts', 'identity_links')`,
  );

  expect(analyticsColumns).not.toMatch(/(^|,)(email|phone|cpf|name)(,|$)/);

  await first.context.close();
  await second.context.close();
});

test('identification consent denial prevents browser identity submission', async ({
  browser,
}) => {
  const before = await clickHouseCommand(
    'SELECT toString(count()) FROM funnel_analytics.identity_links_current',
  );

  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('http://shop.localhost:4173/');
  await injectPixel(page, { consentRequired: true });

  const result = await page.evaluate(async () => {
    window.funnelAnalytics?.consent({
      analytics: true,
      identification: false,
    });

    return (
      (await window.funnelAnalytics?.identify({
        email: 'consent-denied@example.com',
      })) ?? false
    );
  });

  expect(result).toBe(false);

  await new Promise((resolve) => setTimeout(resolve, 500));

  expect(
    await clickHouseCommand(
      'SELECT toString(count()) FROM funnel_analytics.identity_links_current',
    ),
  ).toBe(before);

  await context.close();
});

test('invalid CPF, invalid Origin and paused Pixel are rejected', async () => {
  const basePayload = {
    identify_version: 1,
    visitor_id: '018f0000-0000-7000-8000-000000000101',
    session_id: '018f0000-0000-7000-8000-000000000102',
    occurred_at: new Date().toISOString(),
    consent_state: 'granted',
    sdk_version: '0.2.0',
    test_mode: true,
  };

  const invalidCpf = await fetch(identityEndpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'http://shop.localhost:4173',
    },
    body: JSON.stringify({
      ...basePayload,
      pixel_key: 'px_pub_dddddddddddddddddddddddddddddddddddd',
      identifiers: { cpf: '111.111.111-11' },
    }),
  });
  expect(invalidCpf.status).toBe(422);

  const invalidOrigin = await fetch(identityEndpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://evil.example',
    },
    body: JSON.stringify({
      ...basePayload,
      pixel_key: 'px_pub_dddddddddddddddddddddddddddddddddddd',
      identifiers: { email: 'origin-rejected@example.com' },
    }),
  });
  expect(invalidOrigin.status).toBe(403);

  const pausedPixel = await fetch(identityEndpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'http://shop.localhost:4173',
    },
    body: JSON.stringify({
      ...basePayload,
      pixel_key: 'px_pub_eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
      identifiers: { email: 'paused-rejected@example.com' },
    }),
  });
  expect(pausedPixel.status).toBe(404);
});
