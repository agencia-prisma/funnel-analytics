import type { IdentityEnvelopeV1 } from '@funnel/event-contracts';
import { describe, expect, it } from 'vitest';

import { SupabaseIdentityRepository } from './control-plane';
import { IdentityWorkerError } from './errors';

const envelope: IdentityEnvelopeV1 = {
  envelope_version: 1,
  request_id: '10000000-0000-4000-8000-000000000001',
  received_at: '2026-09-04T20:00:00.000Z',
  workspace_id: '20000000-0000-4000-8000-000000000001',
  pixel_id: '30000000-0000-4000-8000-000000000001',
  visitor_id: '018f0000-0000-7000-8000-000000000001',
  session_id: '018f0000-0000-7000-8000-000000000002',
  encrypted_identifiers: [
    {
      type: 'email',
      blind_index: 'a'.repeat(64),
      encrypted_value:
        'aes256gcm.AAAAAAAAAAAAAAAA.BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
      encryption_key_version: 1,
    },
  ],
  source: 'manual_browser_identify',
  confidence: 'high',
  test_mode: true,
};

async function expectWorkerError(
  promise: Promise<unknown>,
  expectedCode: string,
): Promise<void> {
  try {
    await promise;
    throw new Error('Expected IdentityWorkerError');
  } catch (error) {
    expect(error).toBeInstanceOf(IdentityWorkerError);
    expect((error as IdentityWorkerError).code).toBe(expectedCode);
  }
}

describe('SupabaseIdentityRepository', () => {
  it('invokes injected fetch without rebinding its receiver', async () => {
    const fetchRef = function (
      this: unknown,
      input: RequestInfo | URL,
    ): Promise<Response> {
      if (this !== undefined && this !== null && this !== globalThis) {
        throw new TypeError('Illegal invocation');
      }

      expect(String(input)).toBe(
        'https://example.supabase.co/rest/v1/rpc/resolve_identity_v1',
      );

      return Promise.resolve(
        Response.json([
          {
            resolution_status: 'RESOLVED',
            person_id: '40000000-0000-4000-8000-000000000001',
            person_created: true,
            visitor_link_created: true,
            linked_at: '2026-09-04T20:00:00.000Z',
            last_seen_at: '2026-09-04T20:00:00.000Z',
          },
        ]),
      );
    } as typeof fetch;

    const repository = new SupabaseIdentityRepository(
      'https://example.supabase.co',
      'service-role-test-key',
      fetchRef,
    );

    const result = await repository.resolve(envelope);

    expect(result.resolution_status).toBe('RESOLVED');
    expect(result.person_id).toBe('40000000-0000-4000-8000-000000000001');
  });

  it('classifies missing runtime configuration before HTTP', async () => {
    const repository = new SupabaseIdentityRepository('', '');

    await expectWorkerError(
      repository.resolve(envelope),
      'IDENTITY_CONTROL_PLANE_CONFIG_MISSING',
    );
  });

  it('classifies an invalid Supabase URL before HTTP', async () => {
    const repository = new SupabaseIdentityRepository(
      'not-a-url',
      'service-role-test-key',
    );

    await expectWorkerError(
      repository.resolve(envelope),
      'IDENTITY_CONTROL_PLANE_URL_INVALID',
    );
  });

  it('classifies network failures separately from response failures', async () => {
    const fetchRef = (() =>
      Promise.reject(new TypeError('network unavailable'))) as typeof fetch;
    const repository = new SupabaseIdentityRepository(
      'https://example.supabase.co',
      'service-role-test-key',
      fetchRef,
    );

    await expectWorkerError(
      repository.resolve(envelope),
      'IDENTITY_CONTROL_PLANE_NETWORK_ERROR',
    );
  });
});
