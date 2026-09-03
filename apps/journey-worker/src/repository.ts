import {
  createClickHouseWebClient,
  type ClickHouseConfig,
} from '@funnel/clickhouse';
import type { IdentityLinkV1, SessionFactV1 } from '@funnel/event-contracts';
import type {
  JourneyFactDraft,
  JourneySessionLinkDraft,
} from '@funnel/journey-engine';

import { JourneyWorkerError } from './errors';

export interface PreviousJourneyState {
  maxVersion: string;
  journeyIds: string[];
  sessionIds: string[];
}

export interface JourneyRepository {
  findIdentityForVisitors(
    workspaceId: string,
    visitorIds: string[],
  ): Promise<IdentityLinkV1[]>;
  findIdentityForPerson(
    workspaceId: string,
    personId: string,
  ): Promise<IdentityLinkV1[]>;
  findSessions(
    workspaceId: string,
    visitorIds: string[],
  ): Promise<SessionFactV1[]>;
  previousState(
    workspaceId: string,
    sessionIds: string[],
  ): Promise<PreviousJourneyState>;
  insertJourneyFacts(
    journeys: JourneyFactDraft[],
    version: string,
    updatedAt: string,
  ): Promise<void>;
  insertSessionLinks(
    links: JourneySessionLinkDraft[],
    version: string,
    updatedAt: string,
  ): Promise<void>;
  tombstoneJourneys(
    workspaceId: string,
    journeyIds: string[],
    version: string,
    updatedAt: string,
  ): Promise<void>;
}

function classify(error: unknown, operation: string): JourneyWorkerError {
  const message = error instanceof Error ? error.message : String(error);
  const permanent =
    /authentication|not enough privileges|unknown database|unknown table|syntax error|type mismatch/i.test(
      message,
    );
  const externalCode =
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
      ? error.code
      : null;
  const suffix = externalCode ?? (permanent ? 'INVALID' : 'UNAVAILABLE');
  return new JourneyWorkerError(
    permanent ? 'PERMANENT' : 'TRANSIENT',
    `JOURNEY_${operation}_${suffix}`,
  );
}

export class ClickHouseJourneyRepository implements JourneyRepository {
  private readonly client: ReturnType<typeof createClickHouseWebClient>;

  constructor(config: ClickHouseConfig) {
    this.client = createClickHouseWebClient(
      { ...config, database: config.database ?? 'funnel_analytics' },
      15_000,
    );
  }

  async findIdentityForVisitors(
    workspaceId: string,
    visitorIds: string[],
  ): Promise<IdentityLinkV1[]> {
    if (!visitorIds.length) return [];
    try {
      const result = await this.client.query({
        query: `
SELECT
  link_version,
  workspace_id,
  person_id,
  visitor_id,
  pixel_id,
  source,
  confidence,
  linked_at,
  last_seen_at
FROM funnel_analytics.identity_links_current
WHERE workspace_id = {workspace_id:UUID}
  AND visitor_id IN {visitor_ids:Array(UUID)}
`,
        query_params: { workspace_id: workspaceId, visitor_ids: visitorIds },
        format: 'JSONEachRow',
      });
      return (await result.json()) as IdentityLinkV1[];
    } catch (error) {
      throw classify(error, 'IDENTITY_QUERY');
    }
  }

  async findIdentityForPerson(
    workspaceId: string,
    personId: string,
  ): Promise<IdentityLinkV1[]> {
    try {
      const result = await this.client.query({
        query: `
SELECT
  link_version,
  workspace_id,
  person_id,
  visitor_id,
  pixel_id,
  source,
  confidence,
  linked_at,
  last_seen_at
FROM funnel_analytics.identity_links_current
WHERE workspace_id = {workspace_id:UUID}
  AND person_id = {person_id:UUID}
`,
        query_params: { workspace_id: workspaceId, person_id: personId },
        format: 'JSONEachRow',
      });
      return (await result.json()) as IdentityLinkV1[];
    } catch (error) {
      throw classify(error, 'IDENTITY_QUERY');
    }
  }

  async findSessions(
    workspaceId: string,
    visitorIds: string[],
  ): Promise<SessionFactV1[]> {
    if (!visitorIds.length) return [];
    try {
      const result = await this.client.query({
        query: `
SELECT
  toString(workspace_id) AS workspace_id,
  toString(pixel_id) AS pixel_id,
  toString(session_id) AS session_id,
  toString(visitor_id) AS visitor_id,
  session_partition_month,
  toString(session_started_at) AS session_started_at,
  toString(last_activity_at) AS last_activity_at,
  duration_seconds,
  event_count,
  page_view_count,
  custom_event_count,
  landing_page_url,
  landing_page_path,
  landing_page_title,
  exit_page_url,
  exit_page_path,
  exit_page_title,
  session_referrer,
  session_referrer_domain,
  utm_source,
  utm_medium,
  utm_campaign,
  utm_content,
  utm_term,
  fbclid,
  ttclid,
  gclid,
  msclkid,
  tblci,
  device_type,
  browser_name,
  os_name,
  language,
  timezone,
  test_mode,
  toString(first_event_id) AS first_event_id,
  toString(last_event_id) AS last_event_id,
  toString(max_received_at) AS max_received_at,
  toString(session_version) AS session_version,
  toString(updated_at) AS updated_at
FROM funnel_analytics.session_facts_current
WHERE workspace_id = {workspace_id:UUID}
  AND has({visitor_ids:Array(UUID)}, visitor_id)
ORDER BY session_started_at, last_activity_at, session_id
`,
        query_params: { workspace_id: workspaceId, visitor_ids: visitorIds },
        format: 'JSONEachRow',
      });
      return (await result.json()) as SessionFactV1[];
    } catch (error) {
      throw classify(error, 'SESSION_QUERY');
    }
  }

  async previousState(
    workspaceId: string,
    sessionIds: string[],
  ): Promise<PreviousJourneyState> {
    if (!sessionIds.length)
      return { maxVersion: '0', journeyIds: [], sessionIds: [] };
    try {
      const versions = await this.client.query({
        query: `
SELECT toString(max(journey_version)) AS max_version
FROM
(
  SELECT journey_version
  FROM funnel_analytics.journey_session_links FINAL
  WHERE workspace_id = {workspace_id:UUID}
    AND has({session_ids:Array(UUID)}, session_id)
  UNION ALL
  SELECT journey_version
  FROM funnel_analytics.journey_facts FINAL
  WHERE workspace_id = {workspace_id:UUID}
    AND journey_id IN
    (
      SELECT journey_id
      FROM funnel_analytics.journey_session_links FINAL
      WHERE workspace_id = {workspace_id:UUID}
        AND has({session_ids:Array(UUID)}, session_id)
    )
)
`,
        query_params: { workspace_id: workspaceId, session_ids: sessionIds },
        format: 'JSONEachRow',
      });
      const versionRows = (await versions.json()) as Array<{
        max_version: string;
      }>;

      const previous = await this.client.query({
        query: `
SELECT
  toString(session_id) AS session_id,
  toString(journey_id) AS journey_id
FROM funnel_analytics.journey_session_links_current
WHERE workspace_id = {workspace_id:UUID}
  AND has({session_ids:Array(UUID)}, session_id)
`,
        query_params: { workspace_id: workspaceId, session_ids: sessionIds },
        format: 'JSONEachRow',
      });
      const rows = (await previous.json()) as Array<{
        session_id: string;
        journey_id: string;
      }>;

      return {
        maxVersion: versionRows[0]?.max_version ?? '0',
        journeyIds: [...new Set(rows.map((row) => row.journey_id))],
        sessionIds: [...new Set(rows.map((row) => row.session_id))],
      };
    } catch (error) {
      throw classify(error, 'VERSION_QUERY');
    }
  }

  async insertJourneyFacts(
    journeys: JourneyFactDraft[],
    version: string,
    updatedAt: string,
  ): Promise<void> {
    if (!journeys.length) return;
    try {
      await this.client.insert({
        table: 'funnel_analytics.journey_facts',
        values: journeys.map((journey) => ({
          ...journey,
          journey_version: version,
          is_deleted: false,
          updated_at: updatedAt,
        })),
        format: 'JSONEachRow',
        clickhouse_settings: { wait_for_async_insert: 1 },
      });
    } catch (error) {
      throw classify(error, 'FACTS_INSERT');
    }
  }

  async insertSessionLinks(
    links: JourneySessionLinkDraft[],
    version: string,
    updatedAt: string,
  ): Promise<void> {
    if (!links.length) return;
    try {
      await this.client.insert({
        table: 'funnel_analytics.journey_session_links',
        values: links.map((link) => ({
          ...link,
          journey_version: version,
          is_deleted: false,
          updated_at: updatedAt,
        })),
        format: 'JSONEachRow',
        clickhouse_settings: { wait_for_async_insert: 1 },
      });
    } catch (error) {
      throw classify(error, 'LINKS_INSERT');
    }
  }

  async tombstoneJourneys(
    workspaceId: string,
    journeyIds: string[],
    version: string,
    updatedAt: string,
  ): Promise<void> {
    if (!journeyIds.length) return;
    try {
      const current = await this.client.query({
        query: `
SELECT *
FROM funnel_analytics.journey_facts_current
WHERE workspace_id = {workspace_id:UUID}
  AND has({journey_ids:Array(UUID)}, journey_id)
`,
        query_params: { workspace_id: workspaceId, journey_ids: journeyIds },
        format: 'JSONEachRow',
      });
      const rows = (await current.json()) as Array<Record<string, unknown>>;
      if (!rows.length) return;

      await this.client.insert({
        table: 'funnel_analytics.journey_facts',
        values: rows.map((row) => ({
          ...row,
          journey_version: version,
          is_deleted: true,
          updated_at: updatedAt,
        })),
        format: 'JSONEachRow',
        clickhouse_settings: { wait_for_async_insert: 1 },
      });
    } catch (error) {
      throw classify(error, 'TOMBSTONE_INSERT');
    }
  }

  async close(): Promise<void> {
    await this.client.close();
  }
}
