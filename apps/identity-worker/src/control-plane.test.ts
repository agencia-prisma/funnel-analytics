import type { IdentityEnvelopeV1 } from '@funnel/event-contracts';
import { describe, expect, it } from 'vitest';

import { SupabaseIdentityRepository } from './control-plane';

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

describe('SupabaseIdentityRepository', () => {
  it('invokes injected fetch without rebinding its receiver', async () => {
    let receiver: unknown = Symbol('not-called');

    const fetchRef = function (
      this: unknown,
      input: RequestInfo | URL,
      _init?: RequestInit,
    ): Promise<Response> {
      receiver = this;

      // workerd/Chromium reject Worker global fetch when an unrelated object
      // is supplied as the receiver. This reproduces that production behavior
      // while remaining deterministic in Node/Vitest.
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
    expect(receiver).not.toBe(repository);
  });
});
