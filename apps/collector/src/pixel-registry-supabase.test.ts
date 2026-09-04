import { describe, expect, it, vi } from 'vitest';

import { SupabasePixelRegistry } from './pixel-registry-supabase';

describe('SupabasePixelRegistry', () => {
  it('resolves Pixel and domains in one Data API request', async () => {
    const fetchRef = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input));

        expect(url.pathname).toBe('/rest/v1/pixels');
        expect(url.searchParams.get('public_key')).toMatch(/^eq\.px_pub_/);
        expect(url.searchParams.get('select')).toContain('pixel_domains');
        expect(new Headers(init?.headers).get('apikey')).toBe('test-secret');

        return new Response(
          JSON.stringify([
            {
              id: 'pixel-id',
              workspace_id: 'workspace-id',
              public_key: 'px_pub_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
              status: 'active',
              health_status: 'pending',
              pixel_domains: [
                {
                  id: 'domain-id',
                  domain: 'example.com',
                  wildcard: false,
                  status: 'pending',
                  verified_at: null,
                  last_seen_at: null,
                },
              ],
            },
          ]),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        );
      },
    );

    const registry = new SupabasePixelRegistry(
      'https://project.supabase.co',
      'test-secret',
      fetchRef as typeof fetch,
    );

    await expect(
      registry.resolvePixel('px_pub_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
    ).resolves.toMatchObject({
      id: 'pixel-id',
      workspace_id: 'workspace-id',
      domains: [{ domain: 'example.com' }],
    });

    expect(fetchRef).toHaveBeenCalledTimes(1);
  });

  it('invokes injected fetch without binding the registry as receiver', async () => {
    const fetchRef = function (
      this: unknown,
      input: RequestInfo | URL,
    ): Promise<Response> {
      if (this !== undefined && this !== null && this !== globalThis) {
        throw new TypeError('Illegal invocation');
      }

      expect(String(input)).toContain('/rest/v1/pixels?');

      return Promise.resolve(
        new Response(
          JSON.stringify([
            {
              id: 'pixel-id',
              workspace_id: 'workspace-id',
              public_key: 'px_pub_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
              status: 'active',
              health_status: 'healthy',
              pixel_domains: [],
            },
          ]),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        ),
      );
    } as typeof fetch;

    const registry = new SupabasePixelRegistry(
      'https://project.supabase.co',
      'test-secret',
      fetchRef,
    );

    await expect(
      registry.resolvePixel('px_pub_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
    ).resolves.toMatchObject({ id: 'pixel-id' });
  });

  it('updates operational metadata after accepted ingestion', async () => {
    const requests: Array<{ url: string; body: unknown }> = [];
    const fetchRef = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        requests.push({
          url: String(input),
          body: init?.body ? JSON.parse(String(init.body)) : null,
        });

        return new Response(null, { status: 204 });
      },
    );

    const registry = new SupabasePixelRegistry(
      'https://project.supabase.co',
      'test-secret',
      fetchRef as typeof fetch,
    );

    await registry.touchAccepted(
      {
        id: 'pixel-id',
        workspace_id: 'workspace-id',
        public_key: 'px_pub_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        status: 'active',
        health_status: 'pending',
        domains: [],
      },
      {
        id: 'domain-id',
        domain: 'example.com',
        wildcard: false,
        status: 'pending',
      },
      '2026-08-30T00:00:00.000Z',
    );

    expect(requests).toHaveLength(2);
    expect(requests[0].body).toMatchObject({
      last_event_at: '2026-08-30T00:00:00.000Z',
      health_status: 'healthy',
    });
    expect(requests[1].body).toMatchObject({
      last_seen_at: '2026-08-30T00:00:00.000Z',
      status: 'active',
      verified_at: '2026-08-30T00:00:00.000Z',
    });
  });
});
