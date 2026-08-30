import { describe, expect, it } from 'vitest';

import { createCollector } from './collector';
import type { PixelRegistry } from './pixel-registry';
import type { QueueProducer } from './queue';
import type { RateLimiter } from './rate-limit';
import { TEST_NOW, validBatch } from './test-fixtures';

describe('Collector performance smoke', () => {
  it('handles 200 in-memory requests without a gross regression', async () => {
    const registry: PixelRegistry = {
      async resolvePixel() {
        return {
          id: 'pixel-id',
          workspace_id: 'workspace-id',
          public_key: 'px_pub_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          status: 'active',
          health_status: 'healthy',
          domains: [
            {
              id: 'domain-id',
              domain: 'example.com',
              wildcard: false,
              status: 'active',
            },
          ],
        };
      },
      async touchAccepted() {},
    };

    const queue: QueueProducer = {
      async enqueue() {},
    };

    const rateLimiter: RateLimiter = {
      async allow() {
        return true;
      },
    };

    const collect = createCollector({
      registry,
      queue,
      rateLimiter,
      now: () => TEST_NOW,
    });

    const started = performance.now();

    for (let index = 0; index < 200; index += 1) {
      const batch = validBatch();
      batch.events[0].event_id = `018bcfe5-6800-7000-8000-${String(index + 1).padStart(12, '0')}`;

      const response = await collect(
        new Request('https://collector.test/v1/events', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            origin: 'https://example.com',
          },
          body: JSON.stringify(batch),
        }),
        `request-${index}`,
        { waitUntil() {} },
      );

      expect(response.status).toBe(202);
    }

    expect(performance.now() - started).toBeLessThan(5_000);
  });
});
