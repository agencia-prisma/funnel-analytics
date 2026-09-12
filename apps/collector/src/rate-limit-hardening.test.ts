import { describe, expect, it, vi } from 'vitest';

import { CloudflareRateLimiter } from './rate-limit';
import type { RateLimitBinding } from './types';

const pixelKey = `px_pub_${'a'.repeat(36)}`;

describe('CloudflareRateLimiter hardening', () => {
  it('keeps per-IP limits isolated from global pixel limits', async () => {
    const limit = vi.fn(async () => ({ success: true }));
    const binding: RateLimitBinding = { limit };
    const limiter = new CloudflareRateLimiter(binding);
    const request = new Request('https://collector.test/v1/events', {
      headers: { 'cf-connecting-ip': '203.0.113.10' },
    });

    await limiter.allow(pixelKey, request, 'events');
    await limiter.allowGlobal(pixelKey, 'events:shop.example.com');

    expect(limit).toHaveBeenCalledTimes(2);
    expect(limit.mock.calls[0]?.[0].key).toMatch(/^events:px_pub_[0-9a-f]{36}:[0-9a-f]{24}$/);
    expect(limit.mock.calls[1]?.[0].key).toBe(
      `events:shop.example.com:${pixelKey}`,
    );
  });
});
