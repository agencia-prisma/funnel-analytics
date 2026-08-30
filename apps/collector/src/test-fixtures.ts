import type {
  BrowserEventV1,
  EventBatchV1,
} from '@funnel/event-contracts';

export const TEST_NOW = Date.parse('2026-08-30T00:00:00.000Z');
export const TEST_PIXEL_KEY = 'px_pub_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

export function validPageView(
  overrides: Partial<BrowserEventV1> = {},
): BrowserEventV1 {
  return {
    event_id: '018bcfe5-6800-7000-8000-000000000001',
    event_name: 'page_view',
    event_version: 1,
    sdk_version: '0.2.0',
    pixel_key: TEST_PIXEL_KEY,
    visitor_id: '018bcfe5-6800-7000-8000-000000000002',
    session_id: '018bcfe5-6800-7000-8000-000000000003',
    occurred_at: '2026-08-30T00:00:00.000Z',
    page_url: 'https://example.com/',
    page_path: '/',
    page_title: 'Example',
    referrer: null,
    referrer_domain: null,
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
    utm_content: null,
    utm_term: null,
    click_ids: {},
    device: { type: 'desktop' },
    browser: { name: 'Chrome' },
    os: { name: 'macOS' },
    screen: { width: 1440, height: 900, device_pixel_ratio: 2 },
    viewport: { width: 1280, height: 720 },
    language: 'pt-BR',
    timezone: 'America/Sao_Paulo',
    consent_state: 'granted',
    test_mode: true,
    ...overrides,
  } as BrowserEventV1;
}

export function validBatch(
  events: BrowserEventV1[] = [validPageView()],
): EventBatchV1 {
  return {
    batch_version: 1,
    sent_at: '2026-08-30T00:00:01.000Z',
    events,
  };
}
