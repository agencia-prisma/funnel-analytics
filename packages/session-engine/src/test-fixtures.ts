import type {
  NormalizedEventV1,
  SessionRecomputeEnvelopeV1,
} from '@funnel/event-contracts';

import type { SessionAggregateRow } from './types';

export const TEST_SESSION_ID = '018bcfe5-6800-7000-8000-000000000003';

export function normalizedEvent(
  overrides: Partial<NormalizedEventV1> = {},
): NormalizedEventV1 {
  return {
    event_id: '018bcfe5-6800-7000-8000-000000000001',
    event_version: 1,
    event_name: 'page_view',
    custom_event_name: null,
    workspace_id: '21000000-0000-0000-0000-000000000001',
    pixel_id: '31000000-0000-0000-0000-000000000001',
    visitor_id: '018bcfe5-6800-7000-8000-000000000002',
    session_id: TEST_SESSION_ID,
    occurred_at: '2026-08-31T18:00:00.000Z',
    received_at: '2026-08-31T18:00:01.000Z',
    source: 'browser',
    page_url: 'https://example.com/',
    page_path: '/',
    page_title: 'Landing',
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

export function recomputeEnvelope(
  overrides: Partial<SessionRecomputeEnvelopeV1> = {},
): SessionRecomputeEnvelopeV1 {
  return {
    envelope_version: 1,
    request_id: '550e8400-e29b-41d4-a716-446655440000',
    generated_at: '2026-08-31T18:00:02.000Z',
    workspace_id: '21000000-0000-0000-0000-000000000001',
    pixel_id: '31000000-0000-0000-0000-000000000001',
    session_ids: [TEST_SESSION_ID],
    ...overrides,
  };
}

export function aggregateRow(
  overrides: Partial<SessionAggregateRow> = {},
): SessionAggregateRow {
  return {
    workspace_id: '21000000-0000-0000-0000-000000000001',
    pixel_id: '31000000-0000-0000-0000-000000000001',
    session_id: TEST_SESSION_ID,
    visitor_id: '018bcfe5-6800-7000-8000-000000000002',
    visitor_count: 1,
    test_mode_count: 1,
    session_started_at_ms: 1_788_199_200_000,
    last_activity_at_ms: 1_788_199_800_000,
    max_received_at_ms: 1_788_199_801_000,
    event_count: 3,
    page_view_count: 2,
    custom_event_count: 1,
    landing_page_url: 'https://example.com/',
    landing_page_path: '/',
    landing_page_title: 'Landing',
    exit_page_url: 'https://example.com/checkout',
    exit_page_path: '/checkout',
    exit_page_title: 'Checkout',
    session_referrer: null,
    session_referrer_domain: null,
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
    language: 'pt-BR',
    timezone: 'America/Sao_Paulo',
    test_mode: false,
    first_event_id: '018bcfe5-6800-7000-8000-000000000001',
    last_event_id: '018bcfe5-6800-7000-8000-000000000004',
    ...overrides,
  };
}
