import { describe, expect, it } from 'vitest';

import { createRouter } from './router';
import type { CollectorEnv, ExecutionContextLike } from './types';

const localRegistry = JSON.stringify({
  pixels: [
    {
      id: '31000000-0000-0000-0000-000000000001',
      workspace_id: '21000000-0000-0000-0000-000000000001',
      public_key: 'px_pub_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      status: 'active',
      health_status: 'pending',
      domains: [
        {
          id: '41000000-0000-0000-0000-000000000001',
          domain: 'example.com',
          wildcard: false,
          status: 'pending',
        },
      ],
    },
  ],
});

const env: CollectorEnv = {
  COLLECTOR_ENV: 'local',
  LOCAL_PIXEL_REGISTRY_JSON: localRegistry,
  EVENTS_QUEUE: {
    async send() {},
  },
  IDENTITY_QUEUE: {
    async send() {},
  },
  EVENTS_RATE_LIMITER: {
    async limit() {
      return { success: true };
    },
  },
  IDENTITY_RATE_LIMITER: {
    async limit() {
      return { success: true };
    },
  },
};

const ctx: ExecutionContextLike = {
  waitUntil() {},
};

describe('Collector router', () => {
  it('serves minimal health', async () => {
    const response = await createRouter(env)(
      new Request('https://collector.test/health'),
      ctx,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: 'ok',
      service: 'collector',
      version: '0.1.0',
    });
  });

  it('handles OPTIONS with explicit CORS headers', async () => {
    const response = await createRouter(env)(
      new Request('https://collector.test/v1/events', {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://example.com',
          'Access-Control-Request-Method': 'POST',
        },
      }),
      ctx,
    );

    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(
      'https://example.com',
    );
    expect(response.headers.get('Access-Control-Allow-Methods')).toBe(
      'POST, OPTIONS',
    );
    expect(response.headers.get('Vary')).toBe('Origin');
    expect(response.headers.get('Access-Control-Allow-Credentials')).toBeNull();
  });

  it('rejects OPTIONS without a valid Origin', async () => {
    const response = await createRouter(env)(
      new Request('https://collector.test/v1/events', {
        method: 'OPTIONS',
      }),
      ctx,
    );

    expect(response.status).toBe(403);
  });

  it('returns 405 for unsupported methods', async () => {
    const response = await createRouter(env)(
      new Request('https://collector.test/v1/events', {
        method: 'PUT',
        headers: { Origin: 'https://example.com' },
      }),
      ctx,
    );

    expect(response.status).toBe(405);
    expect(response.headers.get('Allow')).toBe('POST, OPTIONS');
  });
});
