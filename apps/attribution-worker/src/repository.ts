import {
  createClickHouseWebClient,
  type ClickHouseConfig,
} from '@funnel/clickhouse';
import type {
  AttributionFactDraft,
  AttributionOrderV1,
  AttributionSourceEventV1,
} from '@funnel/attribution-engine';

import { AttributionWorkerError } from './errors';

export interface JourneyAttributionContext {
  journeyId: string;
  inactivityWindowSeconds: number;
}

export interface ReplaceAttributionFactsInput {
  workspaceId: string;
  journeyId: string;
  sourceJourneyVersion: string;
  updatedAt: string;
  facts: AttributionFactDraft[];
}

export interface AttributionFactsRepository {
  findJourney(
    workspaceId: string,
    journeyId: string,
  ): Promise<JourneyAttributionContext | null>;
  findOrders(
    workspaceId: string,
    journeyId: string,
  ): Promise<AttributionOrderV1[]>;
  findEvents(
    workspaceId: string,
    journeyId: string,
  ): Promise<AttributionSourceEventV1[]>;
  replaceJourneyFacts(input: ReplaceAttributionFactsInput): Promise<void>;
  tombstoneJourneyFacts(
    workspaceId: string,
    journeyId: string,
    sourceJourneyVersion: string,
    updatedAt: string,
  ): Promise<void>;
}

function classify(error: unknown, operation: string): AttributionWorkerError {
  const message = error instanceof Error ? error.message : String(error);
  const permanent =
    /authentication|not enough privileges|unknown database|unknown table|syntax error|type mismatch/i.test(
      message,
    );
  return new AttributionWorkerError(
    permanent ? 'PERMANENT' : 'TRANSIENT',
    permanent ? 'ATTRIBUTION_FACTS_SCHEMA_INVALID' : operation,
  );
}

function attributionVersions(sourceJourneyVersion: string) {
  const base = BigInt(sourceJourneyVersion) * 2n;
  return { tombstone: base.toString(), active: (base + 1n).toString() };
}

function integer(value: unknown, code: string): number {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && /^\d+$/.test(value)
        ? Number(value)
        : Number.NaN;
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new AttributionWorkerError('PERMANENT', code);
  }
  return parsed;
}

function bool(value: unknown): boolean {
  return value === true || value === 1 || value === '1';
}

export class ClickHouseAttributionFactsRepository implements AttributionFactsRepository {
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
  ): Promise<JourneyAttributionContext | null> {
    try {
      const result = await this.client.query({
        query: `
SELECT
  toString(j.journey_id) AS journey_id,
  j.inactivity_window_seconds
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
        inactivity_window_seconds: number | string;
      }>;
      const row = rows[0];
      return row
        ? {
            journeyId: row.journey_id,
            inactivityWindowSeconds: integer(
              row.inactivity_window_seconds,
              'ATTRIBUTION_JOURNEY_POLICY_INVALID',
            ),
          }
        : null;
    } catch (error) {
      if (error instanceof AttributionWorkerError) throw error;
      throw classify(error, 'ATTRIBUTION_JOURNEY_QUERY_UNAVAILABLE');
    }
  }

  async findOrders(
    workspaceId: string,
    journeyId: string,
  ): Promise<AttributionOrderV1[]> {
    try {
      const result = await this.client.query({
        query: `
SELECT
  toString(c.workspace_id) AS workspace_id,
  toString(c.journey_id) AS journey_id,
  c.person_id,
  c.provider,
  c.order_id,
  c.currency,
  c.status,
  toString(c.purchase_event_id) AS purchase_event_id,
  c.purchased_at,
  c.gross_amount_minor,
  c.refunded_amount_minor,
  c.net_amount_minor,
  c.test_mode
FROM funnel_analytics.commerce_revenue_facts_current AS c
WHERE c.workspace_id = {workspace_id:UUID}
  AND c.journey_id = {journey_id:UUID}
  AND c.is_deleted = false
ORDER BY c.provider, c.order_id
`,
        query_params: { workspace_id: workspaceId, journey_id: journeyId },
        format: 'JSONEachRow',
      });
      const rows = (await result.json()) as Array<Record<string, unknown>>;
      return rows.map((row) => ({
        workspace_id: String(row.workspace_id),
        journey_id: String(row.journey_id),
        person_id: row.person_id === null ? null : String(row.person_id),
        provider: String(row.provider),
        order_id: String(row.order_id),
        currency: String(row.currency),
        status: String(row.status),
        purchase_event_id: String(row.purchase_event_id),
        purchased_at: String(row.purchased_at),
        gross_amount_minor: integer(
          row.gross_amount_minor,
          'ATTRIBUTION_ORDER_INVALID',
        ),
        refunded_amount_minor: integer(
          row.refunded_amount_minor,
          'ATTRIBUTION_ORDER_INVALID',
        ),
        net_amount_minor: integer(
          row.net_amount_minor,
          'ATTRIBUTION_ORDER_INVALID',
        ),
        test_mode: bool(row.test_mode),
      }));
    } catch (error) {
      if (error instanceof AttributionWorkerError) throw error;
      throw classify(error, 'ATTRIBUTION_ORDER_QUERY_UNAVAILABLE');
    }
  }

  async findEvents(
    workspaceId: string,
    journeyId: string,
  ): Promise<AttributionSourceEventV1[]> {
    try {
      const result = await this.client.query({
        query: `
SELECT
  toString(e.event_id) AS event_id,
  toString(e.session_id) AS session_id,
  e.occurred_at,
  e.received_at,
  e.test_mode,
  e.page_url,
  e.page_path,
  e.referrer_domain,
  e.utm_source,
  e.utm_medium,
  e.utm_campaign,
  e.utm_content,
  e.utm_term,
  e.fbclid,
  e.ttclid,
  e.gclid,
  e.msclkid,
  e.tblci
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
      const rows = (await result.json()) as Array<Record<string, unknown>>;
      return rows.map((row) => ({
        event_id: String(row.event_id),
        session_id: String(row.session_id),
        occurred_at: String(row.occurred_at),
        received_at: String(row.received_at),
        test_mode: bool(row.test_mode),
        page_url: String(row.page_url ?? ''),
        page_path: String(row.page_path ?? ''),
        referrer_domain:
          row.referrer_domain === null ? null : String(row.referrer_domain),
        utm_source: row.utm_source === null ? null : String(row.utm_source),
        utm_medium: row.utm_medium === null ? null : String(row.utm_medium),
        utm_campaign:
          row.utm_campaign === null ? null : String(row.utm_campaign),
        utm_content: row.utm_content === null ? null : String(row.utm_content),
        utm_term: row.utm_term === null ? null : String(row.utm_term),
        fbclid: row.fbclid === null ? null : String(row.fbclid),
        ttclid: row.ttclid === null ? null : String(row.ttclid),
        gclid: row.gclid === null ? null : String(row.gclid),
        msclkid: row.msclkid === null ? null : String(row.msclkid),
        tblci: row.tblci === null ? null : String(row.tblci),
      }));
    } catch (error) {
      throw classify(error, 'ATTRIBUTION_EVENT_QUERY_UNAVAILABLE');
    }
  }

  private async currentRows(
    workspaceId: string,
    journeyId: string,
  ): Promise<Array<Record<string, unknown>>> {
    const result = await this.client.query({
      query: `
SELECT *
FROM funnel_analytics.attribution_facts_current
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
    rows: Array<Record<string, unknown>>,
    attributionVersion: string,
    updatedAt: string,
  ): Promise<void> {
    if (!rows.length) return;
    await this.client.insert({
      table: 'funnel_analytics.attribution_facts',
      values: rows.map((row) => ({
        ...row,
        attribution_version: attributionVersion,
        is_deleted: true,
        updated_at: updatedAt,
      })),
      format: 'JSONEachRow',
      clickhouse_settings: { wait_for_async_insert: 1 },
    });
  }

  async replaceJourneyFacts(
    input: ReplaceAttributionFactsInput,
  ): Promise<void> {
    const versions = attributionVersions(input.sourceJourneyVersion);
    try {
      await this.tombstone(
        await this.currentRows(input.workspaceId, input.journeyId),
        versions.tombstone,
        input.updatedAt,
      );
      if (!input.facts.length) return;
      await this.client.insert({
        table: 'funnel_analytics.attribution_facts',
        values: input.facts.map((fact) => ({
          ...fact,
          source_journey_version: input.sourceJourneyVersion,
          attribution_version: versions.active,
          is_deleted: false,
          updated_at: input.updatedAt,
        })),
        format: 'JSONEachRow',
        clickhouse_settings: { wait_for_async_insert: 1 },
      });
    } catch (error) {
      throw classify(error, 'ATTRIBUTION_FACTS_WRITE_UNAVAILABLE');
    }
  }

  async tombstoneJourneyFacts(
    workspaceId: string,
    journeyId: string,
    sourceJourneyVersion: string,
    updatedAt: string,
  ): Promise<void> {
    const versions = attributionVersions(sourceJourneyVersion);
    try {
      await this.tombstone(
        await this.currentRows(workspaceId, journeyId),
        versions.tombstone,
        updatedAt,
      );
    } catch (error) {
      throw classify(error, 'ATTRIBUTION_FACTS_WRITE_UNAVAILABLE');
    }
  }

  async close(): Promise<void> {
    await this.client.close();
  }
}
