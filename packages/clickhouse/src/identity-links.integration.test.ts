import { createClient } from '@clickhouse/client-web';
import type { IdentityLinkV1 } from '@funnel/event-contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import { ClickHouseIdentityLinkWriter } from './identity-links';

const runtimeEnv =
  (
    globalThis as typeof globalThis & {
      process?: {
        env?: Record<string, string | undefined>;
      };
    }
  ).process?.env ?? {};

const url = runtimeEnv.CLICKHOUSE_URL ?? 'http://127.0.0.1:8123';
const username = runtimeEnv.CLICKHOUSE_USERNAME ?? 'default';
const password = runtimeEnv.CLICKHOUSE_PASSWORD ?? '';

const client = createClient({
  url,
  username,
  password,
  database: 'funnel_analytics',
});

const writer = new ClickHouseIdentityLinkWriter({
  url,
  username,
  password,
  database: 'funnel_analytics',
});

const workspaceId = '22000000-0000-0000-0000-000000000001';
const pixelId = '32000000-0000-0000-0000-000000000001';
const personId = '52000000-0000-0000-0000-000000000001';
const visitorA = '018f0000-0000-7000-8000-000000000001';
const visitorB = '018f0000-0000-7000-8000-000000000002';

function link(
  visitorId: string,
  lastSeenAt = '2026-08-31T23:00:00.000Z',
): IdentityLinkV1 {
  return {
    link_version: 1,
    workspace_id: workspaceId,
    person_id: personId,
    visitor_id: visitorId,
    pixel_id: pixelId,
    source: 'manual_browser_identify',
    confidence: 'high',
    linked_at: '2026-08-31T22:00:00.000Z',
    last_seen_at: lastSeenAt,
  };
}

async function rows<T>(query: string): Promise<T[]> {
  const result = await client.query({
    query,
    format: 'JSONEachRow',
  });

  return (await result.json()) as T[];
}

async function insertSession(input: {
  sessionId: string;
  visitorId: string;
  minute: number;
}) {
  const timestamp = `2026-08-31T22:${String(input.minute).padStart(2, '0')}:00.000Z`;

  await client.insert({
    table: 'funnel_analytics.session_facts',
    values: [
      {
        workspace_id: workspaceId,
        pixel_id: pixelId,
        session_id: input.sessionId,
        visitor_id: input.visitorId,
        session_partition_month: 202608,
        session_started_at: timestamp,
        last_activity_at: timestamp,
        duration_seconds: 0,
        event_count: 1,
        page_view_count: 1,
        custom_event_count: 0,
        landing_page_url: 'https://example.com/',
        landing_page_path: '/',
        landing_page_title: 'Example',
        exit_page_url: 'https://example.com/',
        exit_page_path: '/',
        exit_page_title: 'Example',
        session_referrer: null,
        session_referrer_domain: null,
        utm_source: null,
        utm_medium: null,
        utm_campaign: null,
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
        test_mode: false,
        first_event_id: '018f0000-0000-7000-8000-000000000011',
        last_event_id: '018f0000-0000-7000-8000-000000000011',
        max_received_at: timestamp,
        session_version: 1,
        updated_at: timestamp,
      },
    ],
    format: 'JSONEachRow',
  });
}

beforeEach(async () => {
  await client.command({
    query: 'TRUNCATE TABLE funnel_analytics.identity_links',
  });
  await client.command({
    query: 'TRUNCATE TABLE funnel_analytics.session_facts',
  });
});

describe('ClickHouse identity links integration', () => {
  it('stores multiple visitors for the same Person without PII columns', async () => {
    await writer.insertLinks([link(visitorA), link(visitorB)]);

    const result = await rows<{
      people: string;
      visitors: string;
    }>(
      'SELECT toString(uniqExact(person_id)) AS people, toString(uniqExact(visitor_id)) AS visitors FROM funnel_analytics.identity_links_current',
    );

    expect(result[0]).toEqual({
      people: '1',
      visitors: '2',
    });

    const columns = await rows<{ name: string }>(
      "SELECT name FROM system.columns WHERE database = 'funnel_analytics' AND table = 'identity_links' ORDER BY name",
    );
    const names = columns.map((column) => column.name);

    expect(names).not.toContain('email');
    expect(names).not.toContain('phone');
    expect(names).not.toContain('cpf');
    expect(names).not.toContain('name');
  });

  it('keeps one logical current link after repeated delivery', async () => {
    await writer.insertLinks([link(visitorA)]);
    await writer.insertLinks([link(visitorA, '2026-08-31T23:05:00.000Z')]);

    const result = await rows<{
      logical_count: string;
      last_seen_at_ms: string;
    }>(
      'SELECT toString(count()) AS logical_count, toString(toUnixTimestamp64Milli(max(last_seen_at))) AS last_seen_at_ms FROM funnel_analytics.identity_links_current',
    );

    expect(result[0]?.logical_count).toBe('1');
    expect(result[0]?.last_seen_at_ms).toBe(
      String(Date.parse('2026-08-31T23:05:00.000Z')),
    );
  });

  it('joins historical sessions from multiple visitors to one Person', async () => {
    await writer.insertLinks([link(visitorA), link(visitorB)]);
    await insertSession({
      sessionId: '018f0000-0000-7000-8000-000000000021',
      visitorId: visitorA,
      minute: 1,
    });
    await insertSession({
      sessionId: '018f0000-0000-7000-8000-000000000022',
      visitorId: visitorB,
      minute: 2,
    });

    const result = await rows<{
      person_id: string;
      sessions: string;
      visitors: string;
    }>(
      'SELECT toString(person_id) AS person_id, toString(uniqExact(session_id)) AS sessions, toString(uniqExact(visitor_id)) AS visitors FROM funnel_analytics.session_person_links GROUP BY person_id',
    );

    expect(result).toEqual([
      {
        person_id: personId,
        sessions: '2',
        visitors: '2',
      },
    ]);
  });
});
