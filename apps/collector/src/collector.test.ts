import type { CollectorEnvelopeV1 } from '@funnel/event-contracts';
import { describe, expect, it } from 'vitest';

import { createCollector } from './collector';
import type {
  PixelDomainRecord,
  PixelRecord,
  PixelRegistry,
} from './pixel-registry';
import type { QueueProducer } from './queue';
import type { RateLimiter } from './rate-limit';
import {
  TEST_NOW,
  TEST_PIXEL_KEY,
  validBatch,
  validPageView,
} from './test-fixtures';
import type { ExecutionContextLike } from './types';

const exactDomain: PixelDomainRecord = {
  id: '41000000-0000-0000-0000-000000000001',
  domain: 'example.com',
  wildcard: false,
  status: 'pending',
};

const activePixel: PixelRecord = {
  id: '31000000-0000-0000-0000-000000000001',
  workspace_id: '21000000-0000-0000-0000-000000000001',
  public_key: TEST_PIXEL_KEY,
  status: 'active',
  health_status: 'pending',
  domains: [exactDomain],
};

function requestFor(
  batch: unknown = validBatch(),
  origin = 'https://example.com',
): Request {
  return new Request('https://collector.test/v1/events', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin,
      'cf-connecting-ip': '203.0.113.10',
    },
    body: JSON.stringify(batch),
  });
}

function dependencies(options?: {
  pixel?: PixelRecord | null;
  queueFails?: boolean;
  rateAllowed?: boolean;
}) {
  const envelopes: CollectorEnvelopeV1[] = [];
  const touches: Array<{
    pixel: PixelRecord;
    domain: PixelDomainRecord;
    acceptedAt: string;
  }> = [];

  const registry: PixelRegistry = {
    async resolvePixel() {
      return options?.pixel === undefined ? activePixel : options.pixel;
    },
    async touchAccepted(pixel, domain, acceptedAt) {
      touches.push({ pixel, domain, acceptedAt });
    },
  };

  const queue: QueueProducer = {
    async enqueue(envelope) {
      if (options?.queueFails) {
        throw new Error('queue unavailable');
      }

      envelopes.push(envelope);
    },
  };

  const rateLimiter: RateLimiter = {
    async allow() {
      return options?.rateAllowed ?? true;
    },
  };

  return { registry, queue, rateLimiter, envelopes, touches };
}

function context() {
  const promises: Promise<unknown>[] = [];
  const ctx: ExecutionContextLike = {
    waitUntil(promise) {
      promises.push(promise);
    },
  };

  return { ctx, promises };
}

describe('Collector ingestion', () => {
  it('queues a valid batch before returning 202', async () => {
    const deps = dependencies();
    const { ctx, promises } = context();
    const collect = createCollector({
      ...deps,
      now: () => TEST_NOW,
    });

    const response = await collect(requestFor(), 'request-1', ctx);
    const body = await response.json();

    expect(response.status).toBe(202);
    expect(response.headers.get('X-Request-Id')).toBe('request-1');
    expect(body).toEqual({
      accepted: true,
      event_count: 1,
      request_id: 'request-1',
    });
    expect(deps.envelopes).toHaveLength(1);
    expect(deps.envelopes[0]).toMatchObject({
      envelope_version: 1,
      request_id: 'request-1',
      received_at: '2026-08-30T00:00:00.000Z',
      workspace_id: activePixel.workspace_id,
      pixel_id: activePixel.id,
      origin_host: 'example.com',
      source: 'browser',
    });
    expect(deps.envelopes[0].events).toEqual(validBatch().events);

    await Promise.all(promises);
    expect(deps.touches).toHaveLength(1);
    expect(deps.touches[0].domain.status).toBe('pending');
  });

  it.each(['paused', 'archived'] as const)(
    'rejects a %s Pixel',
    async (status) => {
      const deps = dependencies({
        pixel: { ...activePixel, status },
      });
      const { ctx } = context();
      const collect = createCollector({
        ...deps,
        now: () => TEST_NOW,
      });

      const response = await collect(requestFor(), 'request-status', ctx);

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: 'PIXEL_NOT_AVAILABLE' },
      });
      expect(deps.envelopes).toHaveLength(0);
    },
  );

  it('rejects an unknown Pixel without leaking details', async () => {
    const deps = dependencies({ pixel: null });
    const { ctx } = context();
    const collect = createCollector({
      ...deps,
      now: () => TEST_NOW,
    });

    const response = await collect(requestFor(), 'request-missing', ctx);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'PIXEL_NOT_AVAILABLE' },
    });
  });

  it('accepts a valid wildcard subdomain', async () => {
    const pixel: PixelRecord = {
      ...activePixel,
      domains: [
        {
          ...exactDomain,
          domain: 'example.com',
          wildcard: true,
          status: 'active',
        },
      ],
    };
    const deps = dependencies({ pixel });
    const { ctx } = context();
    const collect = createCollector({
      ...deps,
      now: () => TEST_NOW,
    });

    const response = await collect(
      requestFor(
        validBatch([
          validPageView({
            page_url: 'https://checkout.example.com/',
          }),
        ]),
        'https://checkout.example.com',
      ),
      'request-wildcard',
      ctx,
    );

    expect(response.status).toBe(202);
  });

  it.each(['https://fakeexample.com', 'https://example-fake.com'])(
    'rejects wildcard lookalike %s',
    async (origin) => {
      const pixel: PixelRecord = {
        ...activePixel,
        domains: [
          {
            ...exactDomain,
            domain: 'example.com',
            wildcard: true,
            status: 'active',
          },
        ],
      };
      const deps = dependencies({ pixel });
      const { ctx } = context();
      const collect = createCollector({
        ...deps,
        now: () => TEST_NOW,
      });

      const response = await collect(
        requestFor(
          validBatch([
            validPageView({
              page_url: `${origin}/`,
            }),
          ]),
          origin,
        ),
        'request-lookalike',
        ctx,
      );

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: 'ORIGIN_NOT_ALLOWED' },
      });
    },
  );

  it('rejects a page_url hostname that disagrees with Origin', async () => {
    const deps = dependencies();
    const { ctx } = context();
    const collect = createCollector({
      ...deps,
      now: () => TEST_NOW,
    });

    const response = await collect(
      requestFor(
        validBatch([
          validPageView({
            page_url: 'https://spoofed.example/',
          }),
        ]),
      ),
      'request-spoof',
      ctx,
    );

    expect(response.status).toBe(403);
  });

  it('returns 429 with Retry-After when rate limited', async () => {
    const deps = dependencies({ rateAllowed: false });
    const { ctx } = context();
    const collect = createCollector({
      ...deps,
      now: () => TEST_NOW,
    });

    const response = await collect(requestFor(), 'request-rate', ctx);

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('60');
    expect(deps.envelopes).toHaveLength(0);
  });

  it('returns 503 and never 202 when Queue rejects', async () => {
    const deps = dependencies({ queueFails: true });
    const { ctx } = context();
    const collect = createCollector({
      ...deps,
      now: () => TEST_NOW,
    });

    const response = await collect(requestFor(), 'request-queue', ctx);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      accepted: false,
      error: { code: 'QUEUE_UNAVAILABLE' },
    });
  });
});
