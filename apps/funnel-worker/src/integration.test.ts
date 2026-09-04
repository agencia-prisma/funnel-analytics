import { createClickHouseWebClient } from '@funnel/clickhouse';
import { evaluateFunnelProgression } from '@funnel/funnel-engine';
import { beforeEach, describe, expect, it } from 'vitest';

import { ClickHouseFunnelFactsRepository } from './repository';

const runtimeEnv =
  (
    globalThis as typeof globalThis & {
      process?: { env?: Record<string, string | undefined> };
    }
  ).process?.env ?? {};

const config = {
  url: runtimeEnv.CLICKHOUSE_URL ?? 'http://127.0.0.1:8123',
  username: runtimeEnv.CLICKHOUSE_USERNAME ?? 'default',
  password: runtimeEnv.CLICKHOUSE_PASSWORD ?? '',
  database: 'funnel_analytics',
};

const client = createClickHouseWebClient(config);
const repository = new ClickHouseFunnelFactsRepository(config);

const workspaceId = '61000000-0000-4000-8000-000000000001';
const funnelId = '61000000-0000-4000-8000-000000000002';
const funnelVersionId = '61000000-0000-4000-8000-000000000003';
const journeyId = '61000000-0000-4000-8000-000000000004';

const definition = {
  definition_version: 1 as const,
  mode: 'ordered' as const,
  conversion_window_seconds: 3600,
  steps: [
    {
      step_key: 'landing',
      name: 'Landing',
      rule: {
        kind: 'condition' as const,
        field: 'page_path' as const,
        operator: 'equals' as const,
        value: '/product',
      },
    },
    {
      step_key: 'checkout',
      name: 'Checkout',
      rule: {
        kind: 'condition' as const,
        field: 'custom_event_name' as const,
        operator: 'equals' as const,
        value: 'checkout_started',
      },
    },
    {
      step_key: 'purchase',
      name: 'Purchase',
      rule: {
        kind: 'condition' as const,
        field: 'event_name' as const,
        operator: 'equals' as const,
        value: 'purchase',
      },
    },
  ],
};

function event(input: {
  id: string;
  at: string;
  eventName?: string;
  customEventName?: string | null;
  path?: string;
}) {
  return {
    event_id: input.id,
    session_id: '61000000-0000-4000-8000-000000000010',
    visitor_id: '61000000-0000-4000-8000-000000000011',
    pixel_id: '61000000-0000-4000-8000-000000000012',
    occurred_at: input.at,
    received_at: input.at,
    event_name: input.eventName ?? 'page_view',
    custom_event_name: input.customEventName ?? null,
    page_url: `https://example.com${input.path ?? '/'}`,
    page_path: input.path ?? '/',
    page_title: 'Page',
    origin_host: 'example.com',
    referrer_domain: null,
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
    utm_content: null,
    utm_term: null,
    device_type: 'desktop',
    browser_name: 'Chrome',
    os_name: 'macOS',
    language: 'pt-BR',
    timezone: 'America/Sao_Paulo',
    test_mode: false,
    properties: {},
  };
}

async function counts() {
  const result = await client.query({
    query: `
SELECT
  (SELECT count() FROM funnel_analytics.funnel_step_hits_current WHERE is_deleted = false) AS hits,
  (SELECT count() FROM funnel_analytics.funnel_transition_facts_current WHERE is_deleted = false) AS transitions,
  (SELECT count() FROM funnel_analytics.funnel_conversion_facts_current WHERE is_deleted = false) AS conversions
`,
    format: 'JSONEachRow',
  });
  return (await result.json()) as Array<{
    hits: number;
    transitions: number;
    conversions: number;
  }>;
}

beforeEach(async () => {
  for (const table of [
    'funnel_conversion_facts',
    'funnel_transition_facts',
    'funnel_step_hits',
  ]) {
    await client.command({ query: `TRUNCATE TABLE funnel_analytics.${table}` });
  }
});

describe('Funnel facts on isolated ClickHouse', () => {
  it('replaces current facts deterministically and tombstones stale rows', async () => {
    const complete = await evaluateFunnelProgression({
      workspaceId,
      funnelId,
      funnelVersionId,
      funnelVersion: 1,
      journeyId,
      personId: null,
      testMode: false,
      definition,
      events: [
        event({
          id: '61000000-0000-4000-8000-000000000101',
          at: '2026-09-04T12:00:00.000Z',
          path: '/product',
        }),
        event({
          id: '61000000-0000-4000-8000-000000000102',
          at: '2026-09-04T12:01:00.000Z',
          eventName: 'custom_event',
          customEventName: 'checkout_started',
        }),
        event({
          id: '61000000-0000-4000-8000-000000000103',
          at: '2026-09-04T12:02:00.000Z',
          eventName: 'purchase',
        }),
      ],
    });

    await repository.replaceFacts({
      workspaceId,
      funnelVersionId,
      journeyId,
      sourceJourneyVersion: '5',
      updatedAt: '2026-09-04T12:03:00.000Z',
      stepHits: complete.stepHits,
      transitions: complete.transitions,
      conversions: complete.conversions,
    });

    expect(await counts()).toEqual([
      { hits: 3, transitions: 2, conversions: 1 },
    ]);

    const incomplete = await evaluateFunnelProgression({
      workspaceId,
      funnelId,
      funnelVersionId,
      funnelVersion: 1,
      journeyId,
      personId: null,
      testMode: false,
      definition,
      events: [
        event({
          id: '61000000-0000-4000-8000-000000000101',
          at: '2026-09-04T12:00:00.000Z',
          path: '/product',
        }),
        event({
          id: '61000000-0000-4000-8000-000000000102',
          at: '2026-09-04T12:01:00.000Z',
          eventName: 'custom_event',
          customEventName: 'checkout_started',
        }),
      ],
    });

    await repository.replaceFacts({
      workspaceId,
      funnelVersionId,
      journeyId,
      sourceJourneyVersion: '6',
      updatedAt: '2026-09-04T12:04:00.000Z',
      stepHits: incomplete.stepHits,
      transitions: incomplete.transitions,
      conversions: incomplete.conversions,
    });

    expect(await counts()).toEqual([
      { hits: 2, transitions: 1, conversions: 0 },
    ]);

    await repository.tombstoneJourneyFacts(
      workspaceId,
      journeyId,
      '7',
      '2026-09-04T12:05:00.000Z',
    );

    expect(await counts()).toEqual([
      { hits: 0, transitions: 0, conversions: 0 },
    ]);
  });

  it('stores no direct PII columns in funnel fact tables', async () => {
    const result = await client.query({
      query: `
SELECT lower(name) AS name
FROM system.columns
WHERE database = 'funnel_analytics'
  AND table IN (
    'funnel_step_hits',
    'funnel_transition_facts',
    'funnel_conversion_facts'
  )
`,
      format: 'JSONEachRow',
    });
    const rows = (await result.json()) as Array<{ name: string }>;
    const names = rows.map((row) => row.name);

    for (const forbidden of [
      'email',
      'phone',
      'cpf',
      'name',
      'ciphertext',
      'blind_index',
    ]) {
      expect(names).not.toContain(forbidden);
    }
  });
});
