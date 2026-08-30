import type { NormalizedEventV1 } from '@funnel/event-contracts';
import { describe, expect, it } from 'vitest';

import { createInsertDedupToken } from './dedup';

const base = {
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
} satisfies Omit<NormalizedEventV1, 'event_id'>;

describe('ClickHouse insert dedup token', () => {
  it('is deterministic and independent of event order', async () => {
    const a = {
      ...base,
      event_id: '018bcfe5-6800-7000-8000-000000000001',
    };
    const b = {
      ...base,
      event_id: '018bcfe5-6800-7000-8000-000000000004',
    };

    expect(await createInsertDedupToken([a, b])).toBe(
      await createInsertDedupToken([b, a]),
    );
  });
});
