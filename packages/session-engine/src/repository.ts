import {
  createClickHouseWebClient,
  type ClickHouseConfig,
} from '@funnel/clickhouse';
import type { SessionFactV1 } from '@funnel/event-contracts';

import { SessionEngineError } from './errors';
import { snapshotFromAggregate } from './snapshot';
import type {
  SessionAggregateRow,
  SessionQueryGroup,
  SessionRepository,
} from './types';

const MAX_SESSION_SNAPSHOTS_PER_INSERT = 500;

const SESSION_AGGREGATE_QUERY = `
SELECT
  toString(workspace_id) AS workspace_id,
  toString(pixel_id) AS pixel_id,
  toString(session_id) AS session_id,
  toString(argMin(visitor_id, tuple(occurred_at, received_at, event_id))) AS visitor_id,
  uniqExact(visitor_id) AS visitor_count,
  uniqExact(test_mode) AS test_mode_count,
  toUnixTimestamp64Milli(min(occurred_at)) AS session_started_at_ms,
  toUnixTimestamp64Milli(max(occurred_at)) AS last_activity_at_ms,
  toUnixTimestamp64Milli(max(received_at)) AS max_received_at_ms,
  count() AS event_count,
  countIf(event_name = 'page_view') AS page_view_count,
  countIf(custom_event_name IS NOT NULL) AS custom_event_count,
  argMinIf(page_url, tuple(occurred_at, received_at, event_id), event_name = 'page_view') AS landing_page_url,
  argMinIf(page_path, tuple(occurred_at, received_at, event_id), event_name = 'page_view') AS landing_page_path,
  argMinIf(page_title, tuple(occurred_at, received_at, event_id), event_name = 'page_view') AS landing_page_title,
  argMaxIf(page_url, tuple(occurred_at, received_at, event_id), event_name = 'page_view') AS exit_page_url,
  argMaxIf(page_path, tuple(occurred_at, received_at, event_id), event_name = 'page_view') AS exit_page_path,
  argMaxIf(page_title, tuple(occurred_at, received_at, event_id), event_name = 'page_view') AS exit_page_title,
  tupleElement(argMin(tuple(referrer, referrer_domain, utm_source, utm_medium, utm_campaign, utm_content, utm_term, fbclid, ttclid, gclid, msclkid, tblci, device_type, browser_name, os_name, language, timezone, test_mode), tuple(occurred_at, received_at, event_id)), 1) AS session_referrer,
  tupleElement(argMin(tuple(referrer, referrer_domain, utm_source, utm_medium, utm_campaign, utm_content, utm_term, fbclid, ttclid, gclid, msclkid, tblci, device_type, browser_name, os_name, language, timezone, test_mode), tuple(occurred_at, received_at, event_id)), 2) AS session_referrer_domain,
  tupleElement(argMin(tuple(referrer, referrer_domain, utm_source, utm_medium, utm_campaign, utm_content, utm_term, fbclid, ttclid, gclid, msclkid, tblci, device_type, browser_name, os_name, language, timezone, test_mode), tuple(occurred_at, received_at, event_id)), 3) AS utm_source,
  tupleElement(argMin(tuple(referrer, referrer_domain, utm_source, utm_medium, utm_campaign, utm_content, utm_term, fbclid, ttclid, gclid, msclkid, tblci, device_type, browser_name, os_name, language, timezone, test_mode), tuple(occurred_at, received_at, event_id)), 4) AS utm_medium,
  tupleElement(argMin(tuple(referrer, referrer_domain, utm_source, utm_medium, utm_campaign, utm_content, utm_term, fbclid, ttclid, gclid, msclkid, tblci, device_type, browser_name, os_name, language, timezone, test_mode), tuple(occurred_at, received_at, event_id)), 5) AS utm_campaign,
  tupleElement(argMin(tuple(referrer, referrer_domain, utm_source, utm_medium, utm_campaign, utm_content, utm_term, fbclid, ttclid, gclid, msclkid, tblci, device_type, browser_name, os_name, language, timezone, test_mode), tuple(occurred_at, received_at, event_id)), 6) AS utm_content,
  tupleElement(argMin(tuple(referrer, referrer_domain, utm_source, utm_medium, utm_campaign, utm_content, utm_term, fbclid, ttclid, gclid, msclkid, tblci, device_type, browser_name, os_name, language, timezone, test_mode), tuple(occurred_at, received_at, event_id)), 7) AS utm_term,
  tupleElement(argMin(tuple(referrer, referrer_domain, utm_source, utm_medium, utm_campaign, utm_content, utm_term, fbclid, ttclid, gclid, msclkid, tblci, device_type, browser_name, os_name, language, timezone, test_mode), tuple(occurred_at, received_at, event_id)), 8) AS fbclid,
  tupleElement(argMin(tuple(referrer, referrer_domain, utm_source, utm_medium, utm_campaign, utm_content, utm_term, fbclid, ttclid, gclid, msclkid, tblci, device_type, browser_name, os_name, language, timezone, test_mode), tuple(occurred_at, received_at, event_id)), 9) AS ttclid,
  tupleElement(argMin(tuple(referrer, referrer_domain, utm_source, utm_medium, utm_campaign, utm_content, utm_term, fbclid, ttclid, gclid, msclkid, tblci, device_type, browser_name, os_name, language, timezone, test_mode), tuple(occurred_at, received_at, event_id)), 10) AS gclid,
  tupleElement(argMin(tuple(referrer, referrer_domain, utm_source, utm_medium, utm_campaign, utm_content, utm_term, fbclid, ttclid, gclid, msclkid, tblci, device_type, browser_name, os_name, language, timezone, test_mode), tuple(occurred_at, received_at, event_id)), 11) AS msclkid,
  tupleElement(argMin(tuple(referrer, referrer_domain, utm_source, utm_medium, utm_campaign, utm_content, utm_term, fbclid, ttclid, gclid, msclkid, tblci, device_type, browser_name, os_name, language, timezone, test_mode), tuple(occurred_at, received_at, event_id)), 12) AS tblci,
  tupleElement(argMin(tuple(referrer, referrer_domain, utm_source, utm_medium, utm_campaign, utm_content, utm_term, fbclid, ttclid, gclid, msclkid, tblci, device_type, browser_name, os_name, language, timezone, test_mode), tuple(occurred_at, received_at, event_id)), 13) AS device_type,
  tupleElement(argMin(tuple(referrer, referrer_domain, utm_source, utm_medium, utm_campaign, utm_content, utm_term, fbclid, ttclid, gclid, msclkid, tblci, device_type, browser_name, os_name, language, timezone, test_mode), tuple(occurred_at, received_at, event_id)), 14) AS browser_name,
  tupleElement(argMin(tuple(referrer, referrer_domain, utm_source, utm_medium, utm_campaign, utm_content, utm_term, fbclid, ttclid, gclid, msclkid, tblci, device_type, browser_name, os_name, language, timezone, test_mode), tuple(occurred_at, received_at, event_id)), 15) AS os_name,
  tupleElement(argMin(tuple(referrer, referrer_domain, utm_source, utm_medium, utm_campaign, utm_content, utm_term, fbclid, ttclid, gclid, msclkid, tblci, device_type, browser_name, os_name, language, timezone, test_mode), tuple(occurred_at, received_at, event_id)), 16) AS language,
  tupleElement(argMin(tuple(referrer, referrer_domain, utm_source, utm_medium, utm_campaign, utm_content, utm_term, fbclid, ttclid, gclid, msclkid, tblci, device_type, browser_name, os_name, language, timezone, test_mode), tuple(occurred_at, received_at, event_id)), 17) AS timezone,
  tupleElement(argMin(tuple(referrer, referrer_domain, utm_source, utm_medium, utm_campaign, utm_content, utm_term, fbclid, ttclid, gclid, msclkid, tblci, device_type, browser_name, os_name, language, timezone, test_mode), tuple(occurred_at, received_at, event_id)), 18) AS test_mode,
  toString(argMin(event_id, tuple(occurred_at, received_at, event_id))) AS first_event_id,
  toString(argMax(event_id, tuple(occurred_at, received_at, event_id))) AS last_event_id
FROM funnel_analytics.events FINAL
WHERE workspace_id = {workspace_id:UUID}
  AND pixel_id = {pixel_id:UUID}
  AND session_id IN {session_ids:Array(UUID)}
GROUP BY workspace_id, pixel_id, session_id
SETTINGS prefer_column_name_to_alias = 1
`;

function classifyClickHouseFailure(
  error: unknown,
  code: 'SESSION_QUERY_FAILED' | 'SESSION_INSERT_FAILED',
) {
  const message = error instanceof Error ? error.message : String(error);
  const permanent =
    /authentication|not enough privileges|unknown database|unknown table|syntax error|type mismatch/i.test(
      message,
    );

  return new SessionEngineError(permanent ? 'PERMANENT' : 'TRANSIENT', code);
}

async function createSnapshotInsertToken(
  facts: SessionFactV1[],
): Promise<string> {
  const input = facts
    .map(
      (fact) =>
        `${fact.workspace_id}:${fact.pixel_id}:${fact.session_id}:${fact.session_version}`,
    )
    .sort()
    .join('\n');
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(input),
  );

  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

export class ClickHouseSessionRepository implements SessionRepository {
  private readonly client: ReturnType<typeof createClickHouseWebClient>;

  constructor(config: ClickHouseConfig) {
    this.client = createClickHouseWebClient(
      {
        ...config,
        database: config.database ?? 'funnel_analytics',
      },
      10_000,
    );
  }

  async recomputeGroup(group: SessionQueryGroup): Promise<SessionFactV1[]> {
    const sessionIds = [...new Set(group.session_ids)];

    if (sessionIds.length === 0 || sessionIds.length > 100) {
      throw new SessionEngineError('PERMANENT', 'SESSION_BATCH_TOO_LARGE');
    }

    try {
      const result = await this.client.query({
        query: SESSION_AGGREGATE_QUERY,
        query_params: {
          workspace_id: group.workspace_id,
          pixel_id: group.pixel_id,
          session_ids: sessionIds,
        },
        format: 'JSONEachRow',
      });
      const rows = (await result.json()) as SessionAggregateRow[];

      if (rows.length !== sessionIds.length) {
        throw new SessionEngineError('TRANSIENT', 'SESSION_EVENTS_NOT_FOUND');
      }

      return rows.map(snapshotFromAggregate);
    } catch (error) {
      if (error instanceof SessionEngineError) {
        throw error;
      }

      throw classifyClickHouseFailure(error, 'SESSION_QUERY_FAILED');
    }
  }

  async insertSnapshots(facts: SessionFactV1[]): Promise<void> {
    if (facts.length === 0) {
      return;
    }

    if (facts.length > MAX_SESSION_SNAPSHOTS_PER_INSERT) {
      throw new SessionEngineError('PERMANENT', 'SESSION_BATCH_TOO_LARGE');
    }

    try {
      await this.client.insert({
        table: 'funnel_analytics.session_facts',
        values: facts,
        format: 'JSONEachRow',
        clickhouse_settings: {
          insert_deduplication_token: await createSnapshotInsertToken(facts),
          wait_for_async_insert: 1,
        },
      });
    } catch (error) {
      throw classifyClickHouseFailure(error, 'SESSION_INSERT_FAILED');
    }
  }

  async close(): Promise<void> {
    await this.client.close();
  }
}

export { SESSION_AGGREGATE_QUERY };
