import { describe, expect, it, vi } from 'vitest';

import {
  ControlPlaneError,
  SupabasePixelRegistry,
  type ControlPlaneErrorCode,
} from './pixel-registry-supabase';

async function expectControlPlaneError(
  promise: Promise<unknown>,
  expectedCode: ControlPlaneErrorCode,
): Promise<void> {
  try {
    await promise;
    throw new Error('Expected ControlPlaneError');
  } catch (error) {
    expect(error).toBeInstanceOf(ControlPlaneError);
    expect((error as ControlPlaneError).code).toBe(expectedCode);
  }
}

describe('SupabasePixelRegistry', () => {
  it('resolves Pixel and domains in one Data API request', async () => {
    const fetchRef = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input));

        expect(url.pathname).toBe('/rest/v1/pixels');
        expect(url.searchParams.get('public_key')).toMatch(/^eq\.px_pub_/);
        expect(url.searchParams.get('select')).toContain('pixel_domains');
        expect(new Headers(init?.headers).get('apikey')).toBe('test-secret');
        expect(new Headers(init?.headers).get('authorization')).toBe(
          'Bearer test-secret',
        );

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

  it('classifies missing runtime configuration before HTTP', async () => {
    const registry = new SupabasePixelRegistry('', '');

    await expectControlPlaneError(
      registry.resolvePixel('px_pub_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
      'CONTROL_PLANE_CONFIG_MISSING',
    );
  });

  it('classifies an invalid Supabase URL before HTTP', async () => {
    const registry = new SupabasePixelRegistry('not-a-url', 'test-secret');

    await expectControlPlaneError(
      registry.resolvePixel('px_pub_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
      'CONTROL_PLANE_URL_INVALID',
    );
  });

  it.each([401, 403])('classifies HTTP %i as unauthorized', async (status) => {
    const registry = new SupabasePixelRegistry(
      'https://project.supabase.co',
      'test-secret',
      vi.fn(async () => new Response(null, { status })) as typeof fetch,
    );

    await expectControlPlaneError(
      registry.resolvePixel('px_pub_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
      'CONTROL_PLANE_UNAUTHORIZED',
    );
  });

  it.each([
    [408, 'CONTROL_PLANE_TIMEOUT'],
    [504, 'CONTROL_PLANE_TIMEOUT'],
    [429, 'CONTROL_PLANE_UNAVAILABLE'],
    [500, 'CONTROL_PLANE_UNAVAILABLE'],
    [400, 'CONTROL_PLANE_RESPONSE_INVALID'],
  ] as const)('classifies HTTP %i as %s', async (status, expectedCode) => {
    const registry = new SupabasePixelRegistry(
      'https://project.supabase.co',
      'test-secret',
      vi.fn(async () => new Response(null, { status })) as typeof fetch,
    );

    await expectControlPlaneError(
      registry.resolvePixel('px_pub_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
      expectedCode,
    );
  });

  it('classifies malformed JSON responses', async () => {
    const registry = new SupabasePixelRegistry(
      'https://project.supabase.co',
      'test-secret',
      vi.fn(
        async () =>
          new Response('not-json', {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
      ) as typeof fetch,
    );

    await expectControlPlaneError(
      registry.resolvePixel('px_pub_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
      'CONTROL_PLANE_RESPONSE_INVALID',
    );
  });

  it('classifies network failures separately from response failures', async () => {
    const registry = new SupabasePixelRegistry(
      'https://project.supabase.co',
      'test-secret',
      vi.fn(async () => {
        throw new TypeError('network unavailable');
      }) as typeof fetch,
    );

    await expectControlPlaneError(
      registry.resolvePixel('px_pub_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
      'CONTROL_PLANE_NETWORK_ERROR',
    );
  });

  it('classifies aborted requests as timeouts', async () => {
    const fetchRef = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        }),
    );
    const registry = new SupabasePixelRegistry(
      'https://project.supabase.co',
      'test-secret',
      fetchRef as typeof fetch,
      1,
    );

    await expectControlPlaneError(
      registry.resolvePixel('px_pub_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
      'CONTROL_PLANE_TIMEOUT',
    );
  });
});
