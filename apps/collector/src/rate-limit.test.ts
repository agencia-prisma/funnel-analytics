import { describe, expect, it } from 'vitest';

import { CloudflareRateLimiter } from './rate-limit';

describe('CloudflareRateLimiter', () => {
  it('uses a composite key without exposing the raw IP', async () => {
    let capturedKey = '';

    const limiter = new CloudflareRateLimiter({
      async limit({ key }) {
        capturedKey = key;
        return { success: true };
      },
    });

    const allowed = await limiter.allow(
      'px_pub_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      new Request('https://collector.test/v1/events', {
        headers: {
          'cf-connecting-ip': '203.0.113.20',
        },
      }),
    );

    expect(allowed).toBe(true);
    expect(capturedKey).toMatch(/^px_pub_[0-9a-f]+:[0-9a-f]{24}$/);
    expect(capturedKey).not.toContain('203.0.113.20');
  });
});
