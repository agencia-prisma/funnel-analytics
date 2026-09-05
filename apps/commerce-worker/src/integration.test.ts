import { createClickHouseWebClient } from '@funnel/clickhouse';
import { evaluateCommerce } from '@funnel/commerce-engine';
import { beforeEach, describe, expect, it } from 'vitest';

import { ClickHouseCommerceFactsRepository } from './repository';

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
const repository = new ClickHouseCommerceFactsRepository(config);
const workspaceId = '74000000-0000-4000-8000-000000000001';
const journeyId = '74000000-0000-4000-8000-000000000002';

beforeEach(async () => {
  for (const table of [
    'commerce_item_facts',
    'commerce_revenue_facts',
    'commerce_checkout_facts',
  ]) {
    await client.command({ query: `TRUNCATE TABLE funnel_analytics.${table}` });
  }
});

describe('commerce facts on isolated ClickHouse', () => {
  it('queries journey context without UUID alias shadowing', async () => {
    await expect(
      repository.findJourney(workspaceId, journeyId),
    ).resolves.toBeNull();
  });

  it('replaces revenue facts idempotently and tombstones them', async () => {
    const result = evaluateCommerce({
      workspaceId,
      journeyId,
      personId: null,
      testMode: false,
      events: [
        {
          event_id: '74000000-0000-4000-8000-000000000101',
          session_id: '74000000-0000-4000-8000-000000000102',
          visitor_id: '74000000-0000-4000-8000-000000000103',
          pixel_id: '74000000-0000-4000-8000-000000000104',
          occurred_at: '2026-09-05T10:00:00.000Z',
          received_at: '2026-09-05T10:00:00.000Z',
          event_name: 'custom_event',
          custom_event_name: 'purchase',
          test_mode: false,
          properties: {
            order_id: 'order-1',
            currency: 'BRL',
            value_minor: 10000,
          },
        },
      ],
    });
    const input = {
      workspaceId,
      journeyId,
      sourceJourneyVersion: '3',
      updatedAt: '2026-09-05T10:01:00.000Z',
      ...result,
    };
    await repository.replaceFacts(input);
    await repository.replaceFacts(input);

    const current = await client.query({
      query: `SELECT count() AS orders, sum(net_amount_minor) AS revenue FROM funnel_analytics.commerce_revenue_facts_current WHERE is_deleted=false`,
      format: 'JSONEachRow',
    });
    expect(await current.json()).toEqual([{ orders: 1, revenue: 10000 }]);

    await repository.tombstoneJourneyFacts(
      workspaceId,
      journeyId,
      '4',
      '2026-09-05T10:02:00.000Z',
    );
    const after = await client.query({
      query: `SELECT count() AS orders FROM funnel_analytics.commerce_revenue_facts_current WHERE is_deleted=false`,
      format: 'JSONEachRow',
    });
    expect(await after.json()).toEqual([{ orders: 0 }]);
  });

  it('stores no buyer PII columns', async () => {
    const result = await client.query({
      query: `SELECT lower(name) AS name FROM system.columns WHERE database='funnel_analytics' AND table IN ('commerce_checkout_facts','commerce_revenue_facts','commerce_item_facts')`,
      format: 'JSONEachRow',
    });
    const names = ((await result.json()) as Array<{ name: string }>).map(
      (row) => row.name,
    );
    for (const forbidden of [
      'email',
      'phone',
      'cpf',
      'buyer_name',
      'ciphertext',
      'blind_index',
    ]) {
      expect(names).not.toContain(forbidden);
    }
  });
});
