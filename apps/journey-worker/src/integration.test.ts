import { createClickHouseWebClient } from '@funnel/clickhouse';
import { JOURNEY_POLICY_V1 } from '@funnel/journey-engine';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createJourneyConsumer } from './consumer';
import { ClickHouseJourneyRepository } from './repository';
import type { JourneyQueueMessageLike } from './types';

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
const repository = new ClickHouseJourneyRepository(config);

const workspaceId = '21000000-0000-0000-0000-000000000001';
const pixelA = '31000000-0000-0000-0000-000000000001';
const pixelB = '31000000-0000-0000-0000-000000000002';
const visitorA = '018f0000-0000-7000-8000-000000000001';
const visitorB = '018f0000-0000-7000-8000-000000000002';
const personId = '51000000-0000-0000-0000-000000000001';
const s1 = '018f1000-0000-7000-8000-000000000001';
const s2 = '018f1000-0000-7000-8000-000000000002';
const s3 = '018f1000-0000-7000-8000-000000000003';
const s4 = '018f1000-0000-7000-8000-000000000004';

function message(input: {
  reason: 'session_updated' | 'identity_linked';
  visitors: string[];
  person?: string | null;
}): JourneyQueueMessageLike {
  return {
    body: {
      envelope_version: 1,
      request_id: crypto.randomUUID(),
      generated_at: '2026-09-01T12:00:00.000Z',
      workspace_id: workspaceId,
      reason: input.reason,
      visitor_ids: input.visitors,
      person_id: input.person ?? null,
    },
    attempts: 1,
    ack: vi.fn(),
    retry: vi.fn(),
  };
}

async function addSession(input: {
  sessionId: string;
  visitorId: string;
  pixelId: string;
  startedAt: string;
  lastActivityAt?: string;
  testMode?: boolean;
}) {
  const last = input.lastActivityAt ?? input.startedAt;
  await client.insert({
    table: 'funnel_analytics.session_facts',
    values: [
      {
        workspace_id: workspaceId,
        pixel_id: input.pixelId,
        session_id: input.sessionId,
        visitor_id: input.visitorId,
        session_partition_month: 202609,
        session_started_at: input.startedAt,
        last_activity_at: last,
        duration_seconds: Math.max(
          0,
          (Date.parse(last) - Date.parse(input.startedAt)) / 1000,
        ),
        event_count: 1,
        page_view_count: 1,
        custom_event_count: 0,
        landing_page_url: 'https://example.com/landing',
        landing_page_path: '/landing',
        landing_page_title: 'Landing',
        exit_page_url: 'https://example.com/exit',
        exit_page_path: '/exit',
        exit_page_title: 'Exit',
        session_referrer: null,
        session_referrer_domain: null,
        utm_source: 'meta',
        utm_medium: 'paid',
        utm_campaign: 'acceptance',
        utm_content: null,
        utm_term: null,
        fbclid: null,
        ttclid: null,
        gclid: null,
        msclkid: null,
        tblci: null,
        device_type: 'desktop',
        browser_name: 'Chrome',
        os_name: 'macOS',
        language: 'pt-BR',
        timezone: 'America/Sao_Paulo',
        test_mode: input.testMode ?? false,
        first_event_id: '018f2000-0000-7000-8000-000000000001',
        last_event_id: '018f2000-0000-7000-8000-000000000001',
        max_received_at: last,
        session_version: Date.parse(last),
        updated_at: last,
      },
    ],
    format: 'JSONEachRow',
  });
}

async function addIdentity(visitorId: string, pixelId: string) {
  await client.insert({
    table: 'funnel_analytics.identity_links',
    values: [
      {
        workspace_id: workspaceId,
        person_id: personId,
        visitor_id: visitorId,
        pixel_id: pixelId,
        source: 'manual_browser_identify',
        confidence: 'high',
        linked_at: '2026-09-01T12:00:00.000Z',
        last_seen_at: '2026-09-01T12:00:01.000Z',
        link_version: Date.parse('2026-09-01T12:00:01.000Z'),
      },
    ],
    format: 'JSONEachRow',
  });
}

async function rows<T>(query: string): Promise<T[]> {
  const result = await client.query({ query, format: 'JSONEachRow' });
  return (await result.json()) as T[];
}

async function run(input: JourneyQueueMessageLike) {
  const consume = createJourneyConsumer({
    repository,
    dlq: { send: vi.fn(async () => undefined) },
    policy: JOURNEY_POLICY_V1,
    now: () => Date.parse('2026-09-01T12:01:00.000Z'),
  });
  await consume({ messages: [input] });
}

beforeEach(async () => {
  await client.command({
    query: 'TRUNCATE TABLE funnel_analytics.journey_session_links',
  });
  await client.command({
    query: 'TRUNCATE TABLE funnel_analytics.journey_facts',
  });
  await client.command({
    query: 'TRUNCATE TABLE funnel_analytics.identity_links',
  });
  await client.command({
    query: 'TRUNCATE TABLE funnel_analytics.session_facts',
  });
});

describe('Journey acceptance on isolated ClickHouse', () => {
  it('reconciles anonymous history into Person journeys and preserves one current mapping per session', async () => {
    await addSession({
      sessionId: s1,
      visitorId: visitorA,
      pixelId: pixelA,
      startedAt: '2026-09-01T10:00:00.000Z',
    });
    await addSession({
      sessionId: s2,
      visitorId: visitorA,
      pixelId: pixelA,
      startedAt: '2026-09-01T10:20:00.000Z',
    });

    await run(message({ reason: 'session_updated', visitors: [visitorA] }));

    const anonymous = await rows<{
      journey_id: string;
      subject_kind: string;
      session_count: number;
    }>(
      'SELECT toString(journey_id) AS journey_id, subject_kind, session_count FROM funnel_analytics.journey_facts_current',
    );
    expect(anonymous).toHaveLength(1);
    expect(anonymous[0]).toMatchObject({
      subject_kind: 'visitor',
      session_count: 2,
    });
    const anonymousJourneyId = anonymous[0]!.journey_id;

    const linkCounts = await rows<{ raw_links: string; current_links: string }>(
      `SELECT
         (SELECT toString(count()) FROM funnel_analytics.journey_session_links) AS raw_links,
         (SELECT toString(count()) FROM funnel_analytics.journey_session_links_current) AS current_links`,
    );
    expect(linkCounts[0]).toEqual({ raw_links: '2', current_links: '2' });

    const previousAnonymous = await repository.previousState(workspaceId, [
      s1,
      s2,
    ]);
    expect(previousAnonymous.journeyIds).toHaveLength(1);
    expect(previousAnonymous.sessionIds).toHaveLength(2);
    expect(previousAnonymous.maxVersion).toBe('1');

    await addIdentity(visitorA, pixelA);
    await run(
      message({
        reason: 'identity_linked',
        visitors: [visitorA],
        person: personId,
      }),
    );

    const identified = await rows<{
      journey_id: string;
      subject_kind: string;
      person_id: string;
      session_count: number;
    }>(
      'SELECT toString(journey_id) AS journey_id, subject_kind, toString(person_id) AS person_id, session_count FROM funnel_analytics.journey_facts_current',
    );
    expect(identified).toHaveLength(1);
    expect(identified[0]).toMatchObject({
      subject_kind: 'person',
      person_id: personId,
      session_count: 2,
    });
    expect(identified[0]!.journey_id).not.toBe(anonymousJourneyId);

    const tombstone = await rows<{ deleted: number }>(
      `SELECT toUInt8(is_deleted) AS deleted
       FROM funnel_analytics.journey_facts FINAL
       WHERE journey_id = toUUID('${anonymousJourneyId}')`,
    );
    expect(tombstone.at(-1)?.deleted).toBe(1);

    await addSession({
      sessionId: s3,
      visitorId: visitorB,
      pixelId: pixelB,
      startedAt: '2026-09-01T10:40:00.000Z',
    });
    await addIdentity(visitorB, pixelB);
    await run(
      message({
        reason: 'identity_linked',
        visitors: [visitorB],
        person: personId,
      }),
    );

    const merged = await rows<{
      session_count: number;
      visitor_count: number;
      pixel_count: number;
    }>(
      'SELECT session_count, visitor_count, pixel_count FROM funnel_analytics.journey_facts_current',
    );
    expect(merged).toEqual([
      { session_count: 3, visitor_count: 2, pixel_count: 2 },
    ]);

    const links = await rows<{ mappings: string; sessions: string }>(
      'SELECT toString(count()) AS mappings, toString(uniqExact(session_id)) AS sessions FROM funnel_analytics.journey_session_links_current',
    );
    expect(links[0]).toEqual({ mappings: '3', sessions: '3' });

    await addSession({
      sessionId: s4,
      visitorId: visitorB,
      pixelId: pixelB,
      startedAt: '2026-10-05T10:40:00.000Z',
    });
    await run(message({ reason: 'session_updated', visitors: [visitorB] }));

    const separated = await rows<{ journeys: string; sessions: string }>(
      'SELECT toString(count()) AS journeys, toString(sum(session_count)) AS sessions FROM funnel_analytics.journey_facts_current',
    );
    expect(separated[0]).toEqual({ journeys: '2', sessions: '4' });

    await run(message({ reason: 'session_updated', visitors: [visitorB] }));
    const duplicate = await rows<{
      current_mappings: string;
      sessions: string;
    }>(
      'SELECT toString(count()) AS current_mappings, toString(uniqExact(session_id)) AS sessions FROM funnel_analytics.journey_session_links_current',
    );
    expect(duplicate[0]).toEqual({ current_mappings: '4', sessions: '4' });
  });

  it('contains no PII columns in Journey tables', async () => {
    const columns = await rows<{ name: string }>(
      "SELECT lower(name) AS name FROM system.columns WHERE database = 'funnel_analytics' AND table IN ('journey_facts', 'journey_session_links')",
    );
    const names = columns.map((row) => row.name);
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
