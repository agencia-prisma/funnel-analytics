import type { IdentityEnvelopeV1 } from '@funnel/event-contracts';
import { bytesToBase64Url } from '@funnel/identity';
import { describe, expect, it, vi } from 'vitest';

import { createIdentityCollector } from './identify';
import type { IdentityQueueProducer } from './identity-queue';
import type {
  PixelRecord,
  PixelRegistry,
} from './pixel-registry';
import type { RateLimiter } from './rate-limit';

const now = Date.parse('2026-08-31T23:00:00.000Z');
const pixelKey = `px_pub_${'a'.repeat(36)}`;

function key(fill: number) {
  return bytesToBase64Url(new Uint8Array(32).fill(fill));
}

function registry(status: PixelRecord['status'] = 'active'): PixelRegistry {
  return {
    resolvePixel: vi.fn(async () => {
      const pixel: PixelRecord = {
        id: '30000000-0000-4000-8000-000000000001',
        workspace_id: '20000000-0000-4000-8000-000000000001',
        public_key: pixelKey,
        status,
        health_status: 'healthy',
        domains: [
          {
            id: '50000000-0000-4000-8000-000000000001',
            domain: 'shop.example.com',
            wildcard: false,
            status: 'active',
          },
        ],
      };

      return pixel;
    }),
    touchAccepted: vi.fn(async () => undefined),
  };
}

function request(
  identifiers: Record<string, string>,
  consentState: 'unknown' | 'granted' | 'denied' = 'granted',
) {
  return new Request('https://collector.example.com/v1/identify', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://shop.example.com',
    },
    body: JSON.stringify({
      identify_version: 1,
      pixel_key: pixelKey,
      visitor_id: '018f0000-0000-7000-8000-000000000001',
      session_id: '018f0000-0000-7000-8000-000000000002',
      occurred_at: new Date(now).toISOString(),
      identifiers,
      consent_state: consentState,
      sdk_version: '0.2.0',
      test_mode: false,
    }),
  });
}

function dependencies(input?: {
  status?: PixelRecord['status'];
  queueFailure?: boolean;
}) {
  const queued: IdentityEnvelopeV1[] = [];
  const queue: IdentityQueueProducer = {
    enqueue: vi.fn(async (envelope) => {
      if (input?.queueFailure) {
        throw new Error('queue down');
      }
      queued.push(envelope);
    }),
  };
  const rateLimiter: RateLimiter = {
    allow: vi.fn(async () => true),
  };

  return {
    queued,
    dependencies: {
      registry: registry(input?.status),
      queue,
      rateLimiter,
      encryptionKey: key(3),
      hmacKey: key(9),
      now: () => now,
    },
  };
}

describe('identity collector', () => {
  it('returns 202 only after enqueueing protected identifiers', async () => {
    const setup = dependencies();
    const identify = createIdentityCollector(setup.dependencies);

    const response = await identify(
      request({ email: ' User@Example.com ' }),
      '10000000-0000-4000-8000-000000000001',
    );

    expect(response.status).toBe(202);
    expect(setup.queued).toHaveLength(1);

    const serialized = JSON.stringify(setup.queued[0]);
    expect(serialized).not.toContain('User@Example.com');
    expect(serialized).not.toContain('user@example.com');
    expect(setup.queued[0]?.encrypted_identifiers[0]?.blind_index).toMatch(
      /^[0-9a-f]{64}$/,
    );
  });

  it('rejects denied identification consent', async () => {
    const setup = dependencies();
    const identify = createIdentityCollector(setup.dependencies);

    const response = await identify(
      request({ email: 'user@example.com' }, 'denied'),
      '10000000-0000-4000-8000-000000000002',
    );

    expect(response.status).toBe(403);
    expect(setup.queued).toHaveLength(0);
  });

  it('rejects invalid CPF before queueing', async () => {
    const setup = dependencies();
    const identify = createIdentityCollector(setup.dependencies);

    const response = await identify(
      request({ cpf: '111.111.111-11' }),
      '10000000-0000-4000-8000-000000000003',
    );

    expect(response.status).toBe(422);
    expect(setup.queued).toHaveLength(0);
  });

  it('rejects paused pixels', async () => {
    const setup = dependencies({ status: 'paused' });
    const identify = createIdentityCollector(setup.dependencies);

    const response = await identify(
      request({ email: 'user@example.com' }),
      '10000000-0000-4000-8000-000000000004',
    );

    expect(response.status).toBe(404);
    expect(setup.queued).toHaveLength(0);
  });

  it('returns 503 when the identity queue is unavailable', async () => {
    const setup = dependencies({ queueFailure: true });
    const identify = createIdentityCollector(setup.dependencies);

    const response = await identify(
      request({ email: 'user@example.com' }),
      '10000000-0000-4000-8000-000000000005',
    );

    expect(response.status).toBe(503);
  });
});
