import { describe, expect, it } from 'vitest';

import { createCustomEvent, createPageViewEvent } from './events';
import { sanitizeCustomProperties } from './properties';

const navigatorRef = {
  userAgent:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/152.0.0.0 Safari/537.36',
  language: 'pt-BR',
} as Navigator;

function context(now: number) {
  return {
    pixelKey: 'px_pub_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    sdkVersion: '0.2.0',
    testMode: true,
    consentState: 'granted' as const,
    identity: {
      visitorId: '018bcfe5-6800-7000-8000-000000000001',
      sessionId: '018bcfe5-6800-7000-8000-000000000002',
    },
    page: {
      pageUrl: 'https://example.com/',
      pagePath: '/',
      pageTitle: 'Example',
      referrer: null,
      referrerDomain: null,
      language: 'pt-BR',
      timezone: 'America/Sao_Paulo',
      screen: { width: 1440, height: 900, devicePixelRatio: 2 },
      viewport: { width: 1280, height: 720 },
    },
    attribution: {
      timestamp: '2026-08-30T00:00:00.000Z',
      source: 'meta',
      medium: 'paid',
      campaign: 'launch',
      landing_url: 'https://example.com/',
      referrer: null,
      utm_source: 'meta',
      utm_medium: 'paid',
      utm_campaign: 'launch',
      utm_content: null,
      utm_term: null,
      click_ids: { fbclid: 'abc' },
    },
    navigatorRef,
    now,
  };
}

describe('browser events', () => {
  it('creates unique event ids with browser timestamps and versions', () => {
    const first = createPageViewEvent(context(1_700_000_000_000));
    const second = createPageViewEvent(context(1_700_000_000_001));

    expect(first.event_id).not.toBe(second.event_id);
    expect(first.occurred_at).toBe('2023-11-14T22:13:20.000Z');
    expect(first.event_version).toBe(1);
    expect(first.sdk_version).toBe('0.2.0');
    expect(first.event_name).toBe('page_view');
  });

  it('removes PII and reserved fields from custom event properties', () => {
    const properties = sanitizeCustomProperties({
      product: 'shoe',
      email: 'person@example.com',
      password: 'secret',
      visitor_id: 'override',
      nested: {
        telephone: '123',
        sku: 'ABC',
      },
    });

    expect(properties).toEqual({
      product: 'shoe',
      nested: {
        sku: 'ABC',
      },
    });

    const event = createCustomEvent(
      'checkout_button',
      properties,
      context(1_700_000_000_000),
    );

    expect(event?.event_name).toBe('custom_event');
    expect(event?.custom_event_name).toBe('checkout_button');
  });
});
