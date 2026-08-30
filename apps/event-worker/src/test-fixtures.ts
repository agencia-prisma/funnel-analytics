import type {
  BrowserEventV1,
  CollectorEnvelopeV1,
} from '@funnel/event-contracts';

export const TEST_RECEIVED_AT = '2026-08-30T04:00:00.000Z';

export function pageView(
  overrides: Partial<BrowserEventV1> = {},
): BrowserEventV1 {
  return {
    event_id: '018bcfe5-6800-7000-8000-000000000001',
    event_name: 'page_view',
    event_version: 1,
    sdk_version: '0.2.0',
    pixel_key: 'px_pub_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    visitor_id: '018bcfe5-6800-7000-8000-000000000002',
    session_id: '018bcfe5-6800-7000-8000-000000000003',
    occurred_at: '2026-08-30T03:59:59.000Z',
    page_url: 'https://example.com/',
    page_path: '/',
    page_title: 'Example',
    referrer: null,
    referrer_domain: null,
    utm_source: 'meta',
    utm_medium: 'paid',
    utm_campaign: 'launch',
    utm_content: null,
    utm_term: null,
    click_ids: {
      fbclid: 'fb-123',
      ttclid: 'tt-123',
    },
    device: { type: 'desktop' },
    browser: { name: 'Chrome' },
    os: { name: 'macOS' },
    screen: {
      width: 1440,
      height: 900,
      device_pixel_ratio: 2,
    },
    viewport: { width: 1280, height: 720 },
    language: 'pt-BR',
    timezone: 'America/Sao_Paulo',
    consent_state: 'granted',
    test_mode: false,
    ...overrides,
  } as BrowserEventV1;
}

export function envelope(
  overrides: Partial<CollectorEnvelopeV1> = {},
): CollectorEnvelopeV1 {
  return {
    envelope_version: 1,
    request_id: '550e8400-e29b-41d4-a716-446655440000',
    received_at: TEST_RECEIVED_AT,
    collector_version: '0.1.0',
    workspace_id: '21000000-0000-0000-0000-000000000001',
    pixel_id: '31000000-0000-0000-0000-000000000001',
    origin_host: 'example.com',
    source: 'browser',
    events: [pageView()],
    ...overrides,
  };
}
