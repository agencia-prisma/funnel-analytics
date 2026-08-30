import { describe, expect, it } from 'vitest';

import { normalizeEnvelope } from './normalization';
import { envelope, pageView } from './test-fixtures';

describe('event normalization', () => {
  it('maps BrowserEventV1 facts to NormalizedEventV1', () => {
    const [event] = normalizeEnvelope(envelope());

    expect(event).toMatchObject({
      event_name: 'page_view',
      workspace_id: '21000000-0000-0000-0000-000000000001',
      pixel_id: '31000000-0000-0000-0000-000000000001',
      source: 'browser',
      origin_host: 'example.com',
      fbclid: 'fb-123',
      ttclid: 'tt-123',
      test_mode: false,
      properties: {},
    });
  });

  it('preserves custom properties without creating one column per property', () => {
    const custom = {
      ...pageView({
        event_id: '018bcfe5-6800-7000-8000-000000000004',
      }),
      event_name: 'custom_event',
      custom_event_name: 'cta_clicked',
      properties: {
        product: 'shoe',
        placement: 'hero',
      },
    };

    const [event] = normalizeEnvelope(
      envelope({ events: [custom as never] }),
    );

    expect(event.event_name).toBe('cta_clicked');
    expect(event.custom_event_name).toBe('cta_clicked');
    expect(event.properties).toEqual({
      product: 'shoe',
      placement: 'hero',
    });
  });
});
