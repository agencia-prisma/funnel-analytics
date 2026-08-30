import { createClient } from '@clickhouse/client-web';
import type { NormalizedEventV1 } from '@funnel/event-contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import { HttpClickHouseWriter } from './writer';

const url = process.env.CLICKHOUSE_URL ?? 'http://127.0.0.1:8123';
const username = process.env.CLICKHOUSE_USERNAME ?? 'default';
const password = process.env.CLICKHOUSE_PASSWORD ?? '';

const client = createClient({
  url,
  username,
  password,
  database: 'funnel_analytics',
});

const writer = new HttpClickHouseWriter({
  url,
  username,
  password,
  database: 'funnel_analytics',
});

function event(overrides: Partial<NormalizedEventV1> = {}): NormalizedEventV1 {
  return {
    event_id: '018bcfe5-6800-7000-8000-000000000001',
    event_version: 1,
    event_name: 'page_view',
    custom_event_name: null,
    workspace_id: '21000000-0000-0000-0000-000000000001',
    pixel_id: '31000000-0000-0000-0000-000000000001',
    visitor_id: '018bcfe5-6800-7000-8000-000000000002',
    session_id: '018bcfe5-6800-7000-8000-000000000003',
    occurred_at: '2026-08-30T03:59:59.000Z',
    received_at: '2026-08-30T04:00:00.000Z',
    source: 'browser',
    page_url: 'https://example.com/',
    page_path: '/',
    page_title: 'Example',
    origin_host: 'example.com',
    referrer: null,
    referrer_domain: null,
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

async function rows<T>(query: string): Promise<T[]> {
  const result = await client.query({
    query,
    format: 'JSONEachRow',
  });

  return (await result.json()) as T[];
}

beforeEach(async () => {
  await client.command({
    query: 'TRUNCATE TABLE funnel_analytics.events',
  });
});

describe('ClickHouse events integration', () => {
  it('inserts page_view and custom_event with flexible JSON properties', async () => {
    await writer.insertEvents([
      event(),
      event({
        event_id: '018bcfe5-6800-7000-8000-000000000004',
        event_name: 'cta_clicked',
        custom_event_name: 'cta_clicked',
        properties: {
          product: 'shoe',
          placement: 'hero',
        },
        test_mode: true,
      }),
    ]);

    const result = await rows<{
      event_name: string;
      test_mode: number;
      properties_json: string;
    }>(
      'SELECT event_name, test_mode, toJSONString(properties) AS properties_json FROM funnel_analytics.events FINAL ORDER BY event_name',
    );

    expect(result).toHaveLength(2);
    expect(result.some((row) => row.event_name === 'page_view')).toBe(true);
    expect(result.some((row) => row.event_name === 'cta_clicked')).toBe(true);
    expect(result.some((row) => row.test_mode === 1)).toBe(true);
    expect(result.join(' ')).toContain('shoe');
  });

  it('supports nullable attribution and multiple workspaces/pixels', async () => {
    await writer.insertEvents([
      event(),
      event({
        event_id: '018bcfe5-6800-7000-8000-000000000005',
        workspace_id: '21000000-0000-0000-0000-000000000002',
        pixel_id: '31000000-0000-0000-0000-000000000002',
        utm_source: 'meta',
        gclid: 'gclid-1',
      }),
    ]);

    const result = await rows<{ workspaces: string; pixels: string }>(
      'SELECT toString(uniqExact(workspace_id)) AS workspaces, toString(uniqExact(pixel_id)) AS pixels FROM funnel_analytics.events FINAL',
    );

    expect(result[0]).toEqual({
      workspaces: '2',
      pixels: '2',
    });
  });

  it('returns one logical event for duplicate delivery of the same event_id', async () => {
    const duplicate = event();

    await writer.insertEvents([duplicate]);
    await writer.insertEvents([duplicate]);

    const result = await rows<{
      logical_count: string;
      physical_count: string;
    }>(
      'SELECT toString(count()) AS physical_count, toString(count()) AS logical_count FROM funnel_analytics.events FINAL',
    );

    expect(result[0].logical_count).toBe('1');
  });
});
