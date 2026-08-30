import type { EventBatchV1, PageViewEventV1 } from '@funnel/event-contracts';
import { describe, expect, it } from 'vitest';

import { EventQueue } from './queue';
import { MemoryStorageAdapter } from './storage';
import { TestTransport, type Transport } from './transport';

function event(index: number): PageViewEventV1 {
  return {
    event_id: `018bcfe5-6800-7000-8000-${String(index).padStart(12, '0')}`,
    event_name: 'page_view',
    event_version: 1,
    sdk_version: '0.2.0',
    pixel_key: 'px_pub_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    visitor_id: '018bcfe5-6800-7000-8000-000000000001',
    session_id: '018bcfe5-6800-7000-8000-000000000002',
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
    screen: { width: 1, height: 1, device_pixel_ratio: 1 },
    viewport: { width: 1, height: 1 },
    language: 'pt-BR',
    timezone: 'America/Sao_Paulo',
    consent_state: 'granted',
    test_mode: true,
  };
}

describe('event queue', () => {
  it('batches and flushes events', async () => {
    const transport = new TestTransport();
    const queue = new EventQueue(transport, {
      maxBatchEvents: 10,
      persistenceAllowed: () => false,
    });

    queue.enqueue(event(1));
    queue.enqueue(event(2));

    await expect(queue.flush()).resolves.toBe(true);
    expect(transport.batches).toHaveLength(1);
    expect(transport.batches[0].events).toHaveLength(2);
    expect(queue.size()).toBe(0);
  });

  it('retries transient failures with a bounded retry count', async () => {
    let attempts = 0;

    const transport: Transport = {
      async send(_batch: EventBatchV1) {
        attempts += 1;

        return attempts < 3
          ? { ok: false, retryable: true, status: 503 }
          : { ok: true, retryable: false, status: 202 };
      },
    };

    const queue = new EventQueue(transport, {
      maxRetries: 3,
      delay: async () => undefined,
    });

    queue.enqueue(event(1));

    await expect(queue.flush()).resolves.toBe(true);
    expect(attempts).toBe(3);
  });

  it('caps the queue and persisted buffer size', () => {
    const storage = new MemoryStorageAdapter();
    const queue = new EventQueue(null, {
      maxQueueEvents: 2,
      storage,
      persistenceAllowed: () => true,
    });

    queue.enqueue(event(1));
    queue.enqueue(event(2));
    queue.enqueue(event(3));

    expect(queue.size()).toBe(2);
  });
});
