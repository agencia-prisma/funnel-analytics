import { createClickHouseWebClient } from '@funnel/clickhouse';
import { evaluateAttribution } from '@funnel/attribution-engine';
import { beforeEach, describe, expect, it } from 'vitest';

import { ClickHouseAttributionFactsRepository } from './repository';

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
const repository = new ClickHouseAttributionFactsRepository(config);
const workspaceId = '77000000-0000-4000-8000-000000000001';
const journeyId = '77000000-0000-4000-8000-000000000002';
const purchaseEventId = '77000000-0000-4000-8000-000000000101';
const sessionId = '77000000-0000-4000-8000-000000000102';

beforeEach(async () => {
  await client.command({
    query: 'TRUNCATE TABLE funnel_analytics.attribution_facts',
  });
});

describe('attribution facts on isolated ClickHouse', () => {
  it('executes Journey, Commerce order, and event read queries safely', async () => {
    await expect(
      repository.findJourney(workspaceId, journeyId),
    ).resolves.toBeNull();
    await expect(repository.findOrders(workspaceId, journeyId)).resolves.toEqual(
      [],
    );
    await expect(repository.findEvents(workspaceId, journeyId)).resolves.toEqual(
      [],
    );
  });

  it('replaces attribution facts idempotently and tombstones them', async () => {
    const result = evaluateAttribution({
      order: {
        workspace_id: workspaceId,
        journey_id: journeyId,
        person_id: null,
        provider: 'custom',
        order_id: 'order-1',
        currency: 'BRL',
        status: 'partially_refunded',
        purchase_event_id: purchaseEventId,
        purchased_at: '2026-09-05T10:00:00.000Z',
        gross_amount_minor: 10_000,
        refunded_amount_minor: 2_500,
        net_amount_minor: 7_500,
        test_mode: false,
      },
      events: [
        {
          event_id: purchaseEventId,
          session_id: sessionId,
          occurred_at: '2026-09-05T10:00:00.000Z',
          received_at: '2026-09-05T10:00:00.000Z',
          test_mode: false,
          page_url: 'https://example.com/checkout',
          page_path: '/checkout',
          referrer_domain: null,
          utm_source: 'tiktok',
          utm_medium: 'paid_social',
          utm_campaign: 'launch',
          utm_content: 'creator-1',
          utm_term: null,
          fbclid: null,
          ttclid: 'tt-click-1',
          gclid: null,
          msclkid: null,
          tblci: null,
        },
      ],
      lookbackWindowSeconds: 2_592_000,
    });
    const input = {
      workspaceId,
      journeyId,
      sourceJourneyVersion: '3',
      updatedAt: '2026-09-05T10:01:00.000Z',
      facts: result.facts,
    };

    await repository.replaceJourneyFacts(input);
    await repository.replaceJourneyFacts(input);

    const current = await client.query({
      query: `
SELECT
  attribution_model,
  count() AS rows,
  sum(attributed_net_amount_minor) AS revenue
FROM funnel_analytics.attribution_facts_current
WHERE is_deleted = false
GROUP BY attribution_model
ORDER BY attribution_model
`,
      format: 'JSONEachRow',
    });
    expect(await current.json()).toEqual([
      { attribution_model: 'first_touch', rows: 1, revenue: 7500 },
      { attribution_model: 'last_non_direct', rows: 1, revenue: 7500 },
      { attribution_model: 'last_touch', rows: 1, revenue: 7500 },
      { attribution_model: 'linear', rows: 1, revenue: 7500 },
    ]);

    await repository.tombstoneJourneyFacts(
      workspaceId,
      journeyId,
      '4',
      '2026-09-05T10:02:00.000Z',
    );
    const after = await client.query({
      query: `SELECT count() AS rows FROM funnel_analytics.attribution_facts_current WHERE is_deleted=false`,
      format: 'JSONEachRow',
    });
    expect(await after.json()).toEqual([{ rows: 0 }]);
  });

  it('stores no buyer PII columns', async () => {
    const result = await client.query({
      query: `SELECT lower(name) AS name FROM system.columns WHERE database='funnel_analytics' AND table='attribution_facts'`,
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
