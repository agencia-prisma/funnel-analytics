import {
  createClickHouseWebClient,
  HttpClickHouseWriter,
} from '@funnel/clickhouse';
import type { NormalizedEventV1, SessionFactV1 } from '@funnel/event-contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import { SessionEngineError } from './errors';
import { ClickHouseSessionRepository } from './repository';

const runtimeEnv =
  (
    globalThis as typeof globalThis & {
      process?: {
        env?: Record<string, string | undefined>;
      };
    }
  ).process?.env ?? {};

const config = {
  url: runtimeEnv.CLICKHOUSE_URL ?? 'http://127.0.0.1:8123',
  username: runtimeEnv.CLICKHOUSE_USERNAME ?? 'default',
  password: runtimeEnv.CLICKHOUSE_PASSWORD ?? '',
  database: 'funnel_analytics',
};

const client = createClickHouseWebClient(config);
const eventWriter = new HttpClickHouseWriter(config);
const sessions = new ClickHouseSessionRepository(config);

const WORKSPACE_A = '21000000-0000-0000-0000-000000000001';
const WORKSPACE_B = '21000000-0000-0000-0000-000000000002';
const PIXEL_A = '31000000-0000-0000-0000-000000000001';
const PIXEL_B = '31000000-0000-0000-0000-000000000002';
const VISITOR_A = '018bcfe5-6800-7000-8000-000000000002';
const VISITOR_B = '018bcfe5-6800-7000-8000-000000000009';
const SESSION_A = '018bcfe5-6800-7000-8000-000000000003';

function event(overrides: Partial<NormalizedEventV1> = {}): NormalizedEventV1 {
  return {
    event_id: '018bcfe5-6800-7000-8000-000000000001',
    event_version: 1,
    event_name: 'page_view',
    custom_event_name: null,
    workspace_id: WORKSPACE_A,
    pixel_id: PIXEL_A,
    visitor_id: VISITOR_A,
    session_id: SESSION_A,
    occurred_at: '2026-08-31T10:00:00.000Z',
    received_at: '2026-08-31T10:00:01.000Z',
    source: 'browser',
    page_url: 'https://example.com/a',
    page_path: '/a',
    page_title: 'A',
    origin_host: 'example.com',
    referrer: null,
    referrer_domain: null,
    utm_source: 'meta',
    utm_medium: 'paid',
    utm_campaign: 'launch',
    utm_content: null,
    utm_term: null,
    fbclid: 'fb-1',
    ttclid: null,
    gclid: null,
    msclkid: null,
    tblci: null,
    device_type: 'desktop',
    browser_name: 'Chrome',
    os_name: 'macOS',
    screen_width: 1440,
    screen_height: 900,
    device_pixel_ratio: 2,
    viewport_width: 1280,
    viewport_height: 720,
    language: 'pt-BR',
    timezone: 'America/Sao_Paulo',
    consent_state: 'granted',
    test_mode: false,
    sdk_version: '0.2.0',
    properties: {},
    ...overrides,
  };
}

async function recompute(
  workspaceId = WORKSPACE_A,
  pixelId = PIXEL_A,
  sessionIds = [SESSION_A],
): Promise<SessionFactV1[]> {
  const facts = await sessions.recomputeGroup({
    workspace_id: workspaceId,
    pixel_id: pixelId,
    session_ids: sessionIds,
  });
  await sessions.insertSnapshots(facts);
  return facts;
}

async function currentRows<T>(
  query: string,
  queryParams: Record<string, unknown> = {},
): Promise<T[]> {
  const result = await client.query({
    query,
    query_params: queryParams,
    format: 'JSONEachRow',
  });

  return (await result.json()) as T[];
}

beforeEach(async () => {
  await client.command({
    query: 'TRUNCATE TABLE funnel_analytics.events',
  });
  await client.command({
    query: 'TRUNCATE TABLE funnel_analytics.session_facts',
  });
});

describe('session facts ClickHouse integration', () => {
  it('creates a single-event session with zero duration and same landing/exit', async () => {
    await eventWriter.insertEvents([event()]);
    const [fact] = await recompute();

    expect(fact.event_count).toBe(1);
    expect(fact.page_view_count).toBe(1);
    expect(fact.duration_seconds).toBe(0);
    expect(fact.landing_page_path).toBe('/a');
    expect(fact.exit_page_path).toBe('/a');
  });

  it('calculates canonical counts, attribution, landing and exit', async () => {
    await eventWriter.insertEvents([
      event(),
      event({
        event_id: '018bcfe5-6800-7000-8000-000000000004',
        occurred_at: '2026-08-31T10:05:00.000Z',
        received_at: '2026-08-31T10:05:01.000Z',
        event_name: 'cta_clicked',
        custom_event_name: 'cta_clicked',
        page_url: 'https://example.com/a',
        page_path: '/a',
        page_title: 'A',
        properties: { placement: 'hero' },
      }),
      event({
        event_id: '018bcfe5-6800-7000-8000-000000000005',
        occurred_at: '2026-08-31T10:10:00.000Z',
        received_at: '2026-08-31T10:10:01.000Z',
        page_url: 'https://example.com/c',
        page_path: '/c',
        page_title: 'C',
        utm_source: null,
        fbclid: null,
      }),
    ]);

    const [fact] = await recompute();

    expect(fact.duration_seconds).toBe(600);
    expect(fact.event_count).toBe(3);
    expect(fact.page_view_count).toBe(2);
    expect(fact.custom_event_count).toBe(1);
    expect(fact.landing_page_path).toBe('/a');
    expect(fact.exit_page_path).toBe('/c');
    expect(fact.utm_source).toBe('meta');
    expect(fact.fbclid).toBe('fb-1');
  });

  it('recomputes correctly after late and out-of-order events', async () => {
    await eventWriter.insertEvents([
      event(),
      event({
        event_id: '018bcfe5-6800-7000-8000-000000000006',
        occurred_at: '2026-08-31T10:10:00.000Z',
        received_at: '2026-08-31T10:10:01.000Z',
        page_url: 'https://example.com/c',
        page_path: '/c',
        page_title: 'C',
      }),
    ]);
    const [first] = await recompute();

    await eventWriter.insertEvents([
      event({
        event_id: '018bcfe5-6800-7000-8000-000000000007',
        occurred_at: '2026-08-31T10:05:00.000Z',
        received_at: '2026-08-31T10:20:00.000Z',
        page_url: 'https://example.com/b',
        page_path: '/b',
        page_title: 'B',
      }),
    ]);
    const [second] = await recompute();

    expect(second.event_count).toBe(3);
    expect(second.duration_seconds).toBe(600);
    expect(second.landing_page_path).toBe('/a');
    expect(second.exit_page_path).toBe('/c');
    expect(BigInt(second.session_version)).toBeGreaterThan(
      BigInt(first.session_version),
    );

    const current = await currentRows<{
      event_count: number;
      page_view_count: number;
      landing_page_path: string;
      exit_page_path: string;
    }>(
      `SELECT event_count, page_view_count, landing_page_path, exit_page_path
       FROM funnel_analytics.session_facts_current
       WHERE workspace_id = {workspace_id:UUID}
         AND pixel_id = {pixel_id:UUID}
         AND session_id = {session_id:UUID}`,
      {
        workspace_id: WORKSPACE_A,
        pixel_id: PIXEL_A,
        session_id: SESSION_A,
      },
    );

    expect(current).toHaveLength(1);
    expect(current[0]).toMatchObject({
      event_count: 3,
      page_view_count: 3,
      landing_page_path: '/a',
      exit_page_path: '/c',
    });
  });

  it('updates exit when a later page arrives', async () => {
    await eventWriter.insertEvents([event()]);
    await recompute();

    await eventWriter.insertEvents([
      event({
        event_id: '018bcfe5-6800-7000-8000-000000000008',
        occurred_at: '2026-08-31T10:15:00.000Z',
        received_at: '2026-08-31T10:15:01.000Z',
        page_url: 'https://example.com/d',
        page_path: '/d',
        page_title: 'D',
      }),
    ]);
    const [fact] = await recompute();

    expect(fact.duration_seconds).toBe(900);
    expect(fact.exit_page_path).toBe('/d');
  });

  it('supports a custom-event-only session with nullable landing/exit', async () => {
    await eventWriter.insertEvents([
      event({
        event_name: 'purchase_intent',
        custom_event_name: 'purchase_intent',
        properties: { product: 'sku-1' },
      }),
    ]);

    const [fact] = await recompute();

    expect(fact.page_view_count).toBe(0);
    expect(fact.custom_event_count).toBe(1);
    expect(fact.landing_page_url).toBeNull();
    expect(fact.exit_page_url).toBeNull();
  });

  it('rejects visitor and test-mode integrity collisions', async () => {
    await eventWriter.insertEvents([
      event(),
      event({
        event_id: '018bcfe5-6800-7000-8000-000000000010',
        visitor_id: VISITOR_B,
        test_mode: true,
        occurred_at: '2026-08-31T10:01:00.000Z',
        received_at: '2026-08-31T10:01:01.000Z',
      }),
    ]);

    await expect(
      sessions.recomputeGroup({
        workspace_id: WORKSPACE_A,
        pixel_id: PIXEL_A,
        session_ids: [SESSION_A],
      }),
    ).rejects.toMatchObject({
      kind: 'PERMANENT',
      code: 'SESSION_INTEGRITY_VIOLATION',
    } satisfies Partial<SessionEngineError>);
  });

  it('isolates identical session IDs across Workspace and Pixel boundaries', async () => {
    await eventWriter.insertEvents([
      event(),
      event({
        event_id: '018bcfe5-6800-7000-8000-000000000011',
        workspace_id: WORKSPACE_B,
        pixel_id: PIXEL_B,
        page_path: '/other',
        page_url: 'https://other.example/other',
        origin_host: 'other.example',
      }),
    ]);

    await recompute(WORKSPACE_A, PIXEL_A, [SESSION_A]);
    await recompute(WORKSPACE_B, PIXEL_B, [SESSION_A]);

    const rows = await currentRows<{ workspace_id: string }>(
      `SELECT toString(workspace_id) AS workspace_id
       FROM funnel_analytics.session_facts_current
       WHERE session_id = {session_id:UUID}
       ORDER BY workspace_id`,
      { session_id: SESSION_A },
    );

    expect(rows.map((row) => row.workspace_id)).toEqual([
      WORKSPACE_A,
      WORKSPACE_B,
    ]);
  });

  it('does not inflate event_count on duplicate event delivery or recompute retry', async () => {
    const duplicate = event();

    await eventWriter.insertEvents([duplicate]);
    await eventWriter.insertEvents([duplicate]);

    await recompute();
    await recompute();

    const rows = await currentRows<{
      logical_sessions: string;
      event_count: number;
    }>(
      `SELECT
         toString(count()) AS logical_sessions,
         any(event_count) AS event_count
       FROM funnel_analytics.session_facts_current
       WHERE workspace_id = {workspace_id:UUID}
         AND pixel_id = {pixel_id:UUID}
         AND session_id = {session_id:UUID}`,
      {
        workspace_id: WORKSPACE_A,
        pixel_id: PIXEL_A,
        session_id: SESSION_A,
      },
    );

    expect(rows[0]).toEqual({
      logical_sessions: '1',
      event_count: 1,
    });
  });
});
