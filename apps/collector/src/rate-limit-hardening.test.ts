import { describe, expect, it } from 'vitest';

import { CloudflareRateLimiter } from './rate-limit';
import type { RateLimitBinding } from './types';

const pixelKey = `px_pub_${'a'.repeat(36)}`;

describe('CloudflareRateLimiter hardening', () => {
  it('keeps per-IP limits isolated from global pixel limits', async () => {
    const capturedKeys: string[] = [];
    const binding: RateLimitBinding = {
      async limit({ key }) {
        capturedKeys.push(key);
        return { success: true };
      },
    };
    const limiter = new CloudflareRateLimiter(binding);
    const request = new Request('https://collector.test/v1/events', {
      headers: { 'cf-connecting-ip': '203.0.113.10' },
    });

    await limiter.allow(pixelKey, request, 'events');
    await limiter.allowGlobal(pixelKey, 'events:shop.example.com');

    expect(capturedKeys).toHaveLength(2);
    expect(capturedKeys[0]).toMatch(
      /^events:px_pub_[0-9a-f]{36}:[0-9a-f]{24}$/,
    );
    expect(capturedKeys[1]).toBe(`events:shop.example.com:${pixelKey}`);
  });
});
