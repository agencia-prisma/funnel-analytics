import {
  createClickHouseWebClient,
  type ClickHouseConfig,
} from '@funnel/clickhouse';
import type {
  CommerceCheckoutFactDraft,
  CommerceItemFactDraft,
  CommerceRevenueFactDraft,
  CommerceSourceEventV1,
} from '@funnel/commerce-engine';

import { CommerceWorkerError } from './errors';

export interface JourneyCommerceContext {
  journeyId: string;
  personId: string | null;
  testMode: boolean;
}

export interface ReplaceCommerceFactsInput {
  workspaceId: string;
  journeyId: string;
  sourceJourneyVersion: string;
  updatedAt: string;
  checkouts: CommerceCheckoutFactDraft[];
  revenue: CommerceRevenueFactDraft[];
  items: CommerceItemFactDraft[];
}

export interface CommerceFactsRepository {
  findJourney(workspaceId: string, journeyId: string): Promise<JourneyCommerceContext | null>;
  findEvents(workspaceId: string, journeyId: string): Promise<CommerceSourceEventV1[]>;
  replaceFacts(input: ReplaceCommerceFactsInput): Promise<void>;
  tombstoneJourneyFacts(
    workspaceId: string,
    journeyId: string,
    sourceJourneyVersion: string,
    updatedAt: string,
  ): Promise<void>;
}

const TABLES = [
  'commerce_checkout_facts',
  'commerce_revenue_facts',
  'commerce_item_facts',
] as const;
type CommerceTable = (typeof TABLES)[number];

function classify(error: unknown, operation: string): CommerceWorkerError {
  const message = error instanceof Error ? error.message : String(error);
  const permanent =
    /authentication|not enough privileges|unknown database|unknown table|syntax error|type mismatch/i.test(
      message,
    );
  return new CommerceWorkerError(
    permanent ? 'PERMANENT' : 'TRANSIENT',
    permanent ? 'COMMERCE_FACTS_SCHEMA_INVALID' : operation,
  );
}

function factVersions(sourceJourneyVersion: string) {
  const base = BigInt(sourceJourneyVersion) * 2n;
  return { tombstone: base.toString(), active: (base + 1n).toString() };
}

export class ClickHouseCommerceFactsRepository implements CommerceFactsRepository {
  private readonly client: ReturnType<typeof createClickHouseWebClient>;

  constructor(config: ClickHouseConfig) {
    this.client = createClickHouseWebClient(
      { ...config, database: config.database ?? 'funnel_analytics' },
      15_000,
    );
  }

  async findJourney(
    workspaceId: string,
    journeyId: string,
  ): Promise<JourneyCommerceContext | null> {
    try {
      const result = await this.client.query({
        query: `
SELECT
  toString(j.journey_id) AS journey_id,
  j.person_id,
  j.test_mode
FROM funnel_analytics.journey_facts_current AS j
WHERE j.workspace_id = {workspace_id:UUID}
  AND j.journey_id = {journey_id:UUID}
  AND j.is_deleted = false
LIMIT 1
`,
        query_params: { workspace_id: workspaceId, journey_id: journeyId },
        format: 'JSONEachRow',
      });
      const rows = (await result.json()) as Array<{
        journey_id: string;
        person_id: string | null;
        test_mode: boolean;
      }>;
      const row = rows[0];
      return row
        ? { journeyId: row.journey_id, personId: row.person_id, testMode: Boolean(row.test_mode) }
        : null;
    } catch (error) {
      throw classify(error, 'COMMERCE_JOURNEY_QUERY_UNAVAILABLE');
    }
  }

  async findEvents(
    workspaceId: string,
    journeyId: string,
  ): Promise<CommerceSourceEventV1[]> {
    try {
      const result = await this.client.query({
        query: `
SELECT
  toString(e.event_id) AS event_id,
  toString(e.session_id) AS session_id,
  toString(e.visitor_id) AS visitor_id,
  toString(e.pixel_id) AS pixel_id,
  e.occurred_at,
  e.received_at,
  e.event_name,
  e.custom_event_name,
  e.test_mode,
  e.properties
FROM
(
  SELECT *
  FROM funnel_analytics.events FINAL
  WHERE workspace_id = {workspace_id:UUID}
) AS e
INNER JOIN funnel_analytics.journey_session_links_current AS j
  ON j.workspace_id = e.workspace_id
 AND j.session_id = e.session_id
WHERE j.workspace_id = {workspace_id:UUID}
  AND j.journey_id = {journey_id:UUID}
  AND j.is_deleted = false
ORDER BY e.occurred_at, e.received_at, e.event_id
`,
        query_params: { workspace_id: workspaceId, journey_id: journeyId },
        format: 'JSONEachRow',
      });
      return (await result.json()) as CommerceSourceEventV1[];
    } catch (error) {
      throw classify(error, 'COMMERCE_EVENT_QUERY_UNAVAILABLE');
    }
  }

  private async currentRows(
    table: CommerceTable,
    workspaceId: string,
    journeyId: string,
  ): Promise<Array<Record<string, unknown>>> {
    const result = await this.client.query({
      query: `
SELECT *
FROM funnel_analytics.${table}_current
WHERE workspace_id = {workspace_id:UUID}
  AND journey_id = {journey_id:UUID}
  AND is_deleted = false
`,
      query_params: { workspace_id: workspaceId, journey_id: journeyId },
      format: 'JSONEachRow',
    });
    return (await result.json()) as Array<Record<string, unknown>>;
  }

  private async tombstone(
    table: CommerceTable,
    rows: Array<Record<string, unknown>>,
    factVersion: string,
    updatedAt: string,
  ): Promise<void> {
    if (!rows.length) return;
    await this.client.insert({
      table: `funnel_analytics.${table}`,
      values: rows.map((row) => ({
        ...row,
        fact_version: factVersion,
        is_deleted: true,
        updated_at: updatedAt,
      })),
      format: 'JSONEachRow',
      clickhouse_settings: { wait_for_async_insert: 1 },
    });
  }

  async replaceFacts(input: ReplaceCommerceFactsInput): Promise<void> {
    const versions = factVersions(input.sourceJourneyVersion);
    try {
      for (const table of TABLES) {
        await this.tombstone(
          table,
          await this.currentRows(table, input.workspaceId, input.journeyId),
          versions.tombstone,
          input.updatedAt,
        );
      }

      const insert = async (table: CommerceTable, rows: Array<Record<string, unknown>>) => {
        if (!rows.length) return;
        await this.client.insert({
          table: `funnel_analytics.${table}`,
          values: rows.map((row) => ({
            ...row,
            source_journey_version: input.sourceJourneyVersion,
            fact_version: versions.active,
            is_deleted: false,
            updated_at: input.updatedAt,
          })),
          format: 'JSONEachRow',
          clickhouse_settings: { wait_for_async_insert: 1 },
        });
      };

      await insert(
        'commerce_checkout_facts',
        input.checkouts as unknown as Array<Record<string, unknown>>,
      );
      await insert(
        'commerce_revenue_facts',
        input.revenue as unknown as Array<Record<string, unknown>>,
      );
      await insert(
        'commerce_item_facts',
        input.items as unknown as Array<Record<string, unknown>>,
      );
    } catch (error) {
      throw classify(error, 'COMMERCE_FACTS_WRITE_UNAVAILABLE');
    }
  }

  async tombstoneJourneyFacts(
    workspaceId: string,
    journeyId: string,
    sourceJourneyVersion: string,
    updatedAt: string,
  ): Promise<void> {
    const versions = factVersions(sourceJourneyVersion);
    try {
      for (const table of TABLES) {
        await this.tombstone(
          table,
          await this.currentRows(table, workspaceId, journeyId),
          versions.tombstone,
          updatedAt,
        );
      }
    } catch (error) {
      throw classify(error, 'COMMERCE_FACTS_WRITE_UNAVAILABLE');
    }
  }

  async close(): Promise<void> {
    await this.client.close();
  }
}
