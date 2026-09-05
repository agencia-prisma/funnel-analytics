import {
  createClickHouseWebClient,
  type ClickHouseConfig,
} from '@funnel/clickhouse';
import type {
  FunnelConversionFactDraft,
  FunnelProgressionEventV1,
  FunnelStepHitDraft,
  FunnelTransitionFactDraft,
} from '@funnel/funnel-engine';

import { FunnelWorkerError } from './errors';

export interface JourneyEvaluationContext {
  journeyId: string;
  personId: string | null;
  testMode: boolean;
}

export interface ReplaceFunnelFactsInput {
  workspaceId: string;
  funnelVersionId: string;
  journeyId: string;
  sourceJourneyVersion: string;
  updatedAt: string;
  stepHits: FunnelStepHitDraft[];
  transitions: FunnelTransitionFactDraft[];
  conversions: FunnelConversionFactDraft[];
}

export interface FunnelFactsRepository {
  findJourney(
    workspaceId: string,
    journeyId: string,
  ): Promise<JourneyEvaluationContext | null>;
  findEvents(
    workspaceId: string,
    journeyId: string,
  ): Promise<FunnelProgressionEventV1[]>;
  replaceFacts(input: ReplaceFunnelFactsInput): Promise<void>;
  tombstoneJourneyFacts(
    workspaceId: string,
    journeyId: string,
    sourceJourneyVersion: string,
    updatedAt: string,
  ): Promise<void>;
}

const FACT_TABLES = [
  'funnel_step_hits',
  'funnel_transition_facts',
  'funnel_conversion_facts',
] as const;

type FactTable = (typeof FACT_TABLES)[number];

function classify(error: unknown, operation: string): FunnelWorkerError {
  const message = error instanceof Error ? error.message : String(error);
  const permanent =
    /authentication|not enough privileges|unknown database|unknown table|syntax error|type mismatch/i.test(
      message,
    );
  return new FunnelWorkerError(
    permanent ? 'PERMANENT' : 'TRANSIENT',
    permanent ? 'FUNNEL_FACTS_SCHEMA_INVALID' : operation,
  );
}

function factVersions(sourceJourneyVersion: string): {
  tombstone: string;
  active: string;
} {
  const base = BigInt(sourceJourneyVersion) * 2n;
  return {
    tombstone: base.toString(),
    active: (base + 1n).toString(),
  };
}

export class ClickHouseFunnelFactsRepository implements FunnelFactsRepository {
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
  ): Promise<JourneyEvaluationContext | null> {
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
        ? {
            journeyId: row.journey_id,
            personId: row.person_id,
            testMode: Boolean(row.test_mode),
          }
        : null;
    } catch (error) {
      throw classify(error, 'FUNNEL_JOURNEY_QUERY_UNAVAILABLE');
    }
  }

  async findEvents(
    workspaceId: string,
    journeyId: string,
  ): Promise<FunnelProgressionEventV1[]> {
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
  e.page_url,
  e.page_path,
  e.page_title,
  e.origin_host,
  e.referrer_domain,
  e.utm_source,
  e.utm_medium,
  e.utm_campaign,
  e.utm_content,
  e.utm_term,
  e.device_type,
  e.browser_name,
  e.os_name,
  e.language,
  e.timezone,
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
      return (await result.json()) as FunnelProgressionEventV1[];
    } catch (error) {
      throw classify(error, 'FUNNEL_EVENT_QUERY_UNAVAILABLE');
    }
  }

  private async currentRows(
    table: FactTable,
    workspaceId: string,
    journeyId: string,
    funnelVersionId?: string,
  ): Promise<Array<Record<string, unknown>>> {
    const versionFilter = funnelVersionId
      ? 'AND funnel_version_id = {funnel_version_id:UUID}'
      : '';
    const result = await this.client.query({
      query: `
SELECT *
FROM funnel_analytics.${table}_current
WHERE workspace_id = {workspace_id:UUID}
  AND journey_id = {journey_id:UUID}
  AND is_deleted = false
  ${versionFilter}
`,
      query_params: {
        workspace_id: workspaceId,
        journey_id: journeyId,
        ...(funnelVersionId ? { funnel_version_id: funnelVersionId } : {}),
      },
      format: 'JSONEachRow',
    });
    return (await result.json()) as Array<Record<string, unknown>>;
  }

  private async insertTombstones(
    table: FactTable,
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

  async replaceFacts(input: ReplaceFunnelFactsInput): Promise<void> {
    const versions = factVersions(input.sourceJourneyVersion);
    try {
      for (const table of FACT_TABLES) {
        const current = await this.currentRows(
          table,
          input.workspaceId,
          input.journeyId,
          input.funnelVersionId,
        );
        await this.insertTombstones(
          table,
          current,
          versions.tombstone,
          input.updatedAt,
        );
      }

      if (input.stepHits.length) {
        await this.client.insert({
          table: 'funnel_analytics.funnel_step_hits',
          values: input.stepHits.map((fact) => ({
            ...fact,
            source_journey_version: input.sourceJourneyVersion,
            fact_version: versions.active,
            is_deleted: false,
            updated_at: input.updatedAt,
          })),
          format: 'JSONEachRow',
          clickhouse_settings: { wait_for_async_insert: 1 },
        });
      }

      if (input.transitions.length) {
        await this.client.insert({
          table: 'funnel_analytics.funnel_transition_facts',
          values: input.transitions.map((fact) => ({
            ...fact,
            source_journey_version: input.sourceJourneyVersion,
            fact_version: versions.active,
            is_deleted: false,
            updated_at: input.updatedAt,
          })),
          format: 'JSONEachRow',
          clickhouse_settings: { wait_for_async_insert: 1 },
        });
      }

      if (input.conversions.length) {
        await this.client.insert({
          table: 'funnel_analytics.funnel_conversion_facts',
          values: input.conversions.map((fact) => ({
            ...fact,
            source_journey_version: input.sourceJourneyVersion,
            fact_version: versions.active,
            is_deleted: false,
            updated_at: input.updatedAt,
          })),
          format: 'JSONEachRow',
          clickhouse_settings: { wait_for_async_insert: 1 },
        });
      }
    } catch (error) {
      throw classify(error, 'FUNNEL_FACTS_WRITE_UNAVAILABLE');
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
      for (const table of FACT_TABLES) {
        const current = await this.currentRows(table, workspaceId, journeyId);
        await this.insertTombstones(
          table,
          current,
          versions.tombstone,
          updatedAt,
        );
      }
    } catch (error) {
      throw classify(error, 'FUNNEL_FACTS_WRITE_UNAVAILABLE');
    }
  }

  async close(): Promise<void> {
    await this.client.close();
  }
}
