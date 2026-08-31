import type { NormalizedEventV1 } from '@funnel/event-contracts';

import { createClickHouseWebClient } from './client';
import { createInsertDedupToken } from './dedup';
import type {
  ClickHouseConfig,
  ClickHouseInsertResult,
  ClickHouseWriter,
} from './types';

const DEFAULT_DATABASE = 'funnel_analytics';
const DEFAULT_TABLE = 'events';
const MAX_INSERT_EVENTS = 5_000;
const MAX_INSERT_BYTES = 2 * 1024 * 1024;

export class ClickHouseWriteError extends Error {
  constructor(
    readonly retryable: boolean,
    message = 'CLICKHOUSE_WRITE_FAILED',
  ) {
    super(message);
    this.name = 'ClickHouseWriteError';
  }
}

function serializedBytes(events: NormalizedEventV1[]): number {
  return new TextEncoder().encode(JSON.stringify(events)).byteLength;
}

function row(event: NormalizedEventV1) {
  return {
    event_id: event.event_id,
    event_version: event.event_version,
    event_name: event.event_name,
    custom_event_name: event.custom_event_name,
    workspace_id: event.workspace_id,
    pixel_id: event.pixel_id,
    visitor_id: event.visitor_id,
    session_id: event.session_id,
    occurred_at: event.occurred_at,
    received_at: event.received_at,
    source: event.source,
    page_url: event.page_url,
    page_path: event.page_path,
    page_title: event.page_title,
    origin_host: event.origin_host,
    referrer: event.referrer,
    referrer_domain: event.referrer_domain,
    utm_source: event.utm_source,
    utm_medium: event.utm_medium,
    utm_campaign: event.utm_campaign,
    utm_content: event.utm_content,
    utm_term: event.utm_term,
    fbclid: event.fbclid,
    ttclid: event.ttclid,
    gclid: event.gclid,
    msclkid: event.msclkid,
    tblci: event.tblci,
    device_type: event.device_type,
    browser_name: event.browser_name,
    os_name: event.os_name,
    screen_width: event.screen_width,
    screen_height: event.screen_height,
    device_pixel_ratio: event.device_pixel_ratio,
    viewport_width: event.viewport_width,
    viewport_height: event.viewport_height,
    language: event.language,
    timezone: event.timezone,
    consent_state: event.consent_state,
    test_mode: event.test_mode,
    sdk_version: event.sdk_version,
    properties: event.properties,
    dedup_version: Date.parse(event.received_at),
  };
}

export class HttpClickHouseWriter implements ClickHouseWriter {
  private readonly database: string;
  private readonly client: ReturnType<typeof createClickHouseWebClient>;

  constructor(config: ClickHouseConfig) {
    this.database = config.database ?? DEFAULT_DATABASE;
    this.client = createClickHouseWebClient({
      ...config,
      database: this.database,
    });
  }

  async insertEvents(
    events: NormalizedEventV1[],
    dedupToken?: string,
  ): Promise<ClickHouseInsertResult> {
    if (!events.length) {
      return { eventCount: 0, dedupToken: dedupToken ?? '' };
    }

    if (
      events.length > MAX_INSERT_EVENTS ||
      serializedBytes(events) > MAX_INSERT_BYTES
    ) {
      throw new ClickHouseWriteError(false, 'CLICKHOUSE_BATCH_TOO_LARGE');
    }

    const token = dedupToken ?? (await createInsertDedupToken(events));

    try {
      await this.client.insert({
        table: `${this.database}.${DEFAULT_TABLE}`,
        values: events.map(row),
        format: 'JSONEachRow',
        clickhouse_settings: {
          insert_deduplication_token: token,
          wait_for_async_insert: 1,
        },
      });

      return {
        eventCount: events.length,
        dedupToken: token,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const permanent =
        /authentication|not enough privileges|unknown database|unknown table|syntax error|type mismatch/i.test(
          message,
        );

      throw new ClickHouseWriteError(!permanent);
    }
  }

  async close(): Promise<void> {
    await this.client.close();
  }
}
