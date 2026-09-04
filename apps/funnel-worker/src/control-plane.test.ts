import { describe, expect, it, vi } from 'vitest';

import { SupabaseFunnelControlPlane } from './control-plane';

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('Supabase Funnel Control Plane', () => {
  it('loads and validates active immutable definitions', async () => {
    const fetchRef = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        response([
          {
            id: '00000000-0000-4000-8000-000000000001',
            current_version_id: '00000000-0000-4000-8000-000000000002',
          },
        ]),
      )
      .mockResolvedValueOnce(
        response([
          {
            id: '00000000-0000-4000-8000-000000000002',
            funnel_id: '00000000-0000-4000-8000-000000000001',
            version: 3,
            definition_version: 1,
            mode: 'ordered',
            conversion_window_seconds: 3600,
          },
        ]),
      )
      .mockResolvedValueOnce(
        response([
          {
            funnel_version_id: '00000000-0000-4000-8000-000000000002',
            step_key: 'landing',
            position: 1,
            name: 'Landing',
            rule: {
              kind: 'condition',
              field: 'page_path',
              operator: 'equals',
              value: '/product',
            },
          },
          {
            funnel_version_id: '00000000-0000-4000-8000-000000000002',
            step_key: 'purchase',
            position: 2,
            name: 'Purchase',
            rule: {
              kind: 'condition',
              field: 'event_name',
              operator: 'equals',
              value: 'purchase',
            },
          },
        ]),
      );

    const controlPlane = new SupabaseFunnelControlPlane(
      'https://example.supabase.co',
      'server-secret',
      fetchRef,
    );

    const definitions = await controlPlane.activeDefinitions(
      '00000000-0000-4000-8000-000000000099',
    );

    expect(definitions).toHaveLength(1);
    expect(definitions[0]).toMatchObject({
      funnelVersion: 3,
      definition: { mode: 'ordered', conversion_window_seconds: 3600 },
    });
    expect(fetchRef).toHaveBeenCalledTimes(3);
  });

  it('fails fast when control-plane configuration is missing', async () => {
    const controlPlane = new SupabaseFunnelControlPlane('', '');

    await expect(
      controlPlane.activeDefinitions('00000000-0000-4000-8000-000000000099'),
    ).rejects.toMatchObject({
      kind: 'PERMANENT',
      code: 'FUNNEL_CONTROL_PLANE_CONFIG_MISSING',
    });
  });

  it('classifies server failures as transient', async () => {
    const controlPlane = new SupabaseFunnelControlPlane(
      'https://example.supabase.co',
      'server-secret',
      vi.fn<typeof fetch>().mockResolvedValue(response({}, 503)),
    );

    await expect(
      controlPlane.activeDefinitions('00000000-0000-4000-8000-000000000099'),
    ).rejects.toMatchObject({
      kind: 'TRANSIENT',
      code: 'FUNNEL_CONTROL_PLANE_UNAVAILABLE',
    });
  });

  it('rejects structurally invalid active definitions permanently', async () => {
    const fetchRef = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        response([
          {
            id: '00000000-0000-4000-8000-000000000001',
            current_version_id: '00000000-0000-4000-8000-000000000002',
          },
        ]),
      )
      .mockResolvedValueOnce(
        response([
          {
            id: '00000000-0000-4000-8000-000000000002',
            funnel_id: '00000000-0000-4000-8000-000000000001',
            version: 1,
            definition_version: 1,
            mode: 'ordered',
            conversion_window_seconds: 3600,
          },
        ]),
      )
      .mockResolvedValueOnce(response([]));

    const controlPlane = new SupabaseFunnelControlPlane(
      'https://example.supabase.co',
      'server-secret',
      fetchRef,
    );

    await expect(
      controlPlane.activeDefinitions('00000000-0000-4000-8000-000000000099'),
    ).rejects.toMatchObject({
      kind: 'PERMANENT',
      code: 'FUNNEL_DEFINITION_INVALID',
    });
  });
});
