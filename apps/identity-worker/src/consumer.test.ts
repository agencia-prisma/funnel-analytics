import type {
  IdentityEnvelopeV1,
  IdentityLinkV1,
} from '@funnel/event-contracts';
import { describe, expect, it, vi } from 'vitest';

import { createIdentityConsumer } from './consumer';
import type { IdentityDlqProducer } from './dlq';
import type { IdentityQueueBatchLike, IdentityQueueMessageLike } from './types';

const envelope: IdentityEnvelopeV1 = {
  envelope_version: 1,
  request_id: '10000000-0000-4000-8000-000000000001',
  received_at: '2026-08-31T23:00:00.000Z',
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
  test_mode: false,
};

function message(body: unknown = envelope) {
  const ack = vi.fn();
  const retry = vi.fn();

  const value: IdentityQueueMessageLike = {
    body,
    attempts: 1,
    ack,
    retry,
  };

  return { value, ack, retry };
}

function batch(value: IdentityQueueMessageLike): IdentityQueueBatchLike {
  return { messages: [value] };
}

describe('identity worker consumer', () => {
  it('acks only after control-plane resolution and ClickHouse link write', async () => {
    const current = message();
    const insertLinks = vi.fn(async (_links: IdentityLinkV1[]) => undefined);
    const resolve = vi.fn(async () => ({
      resolution_status: 'RESOLVED' as const,
      person_id: '40000000-0000-4000-8000-000000000001',
      person_created: true,
      visitor_link_created: true,
      linked_at: '2026-08-31T23:00:00.000Z',
      last_seen_at: '2026-08-31T23:00:00.000Z',
    }));

    const consume = createIdentityConsumer({
      repository: { resolve },
      writer: { insertLinks },
      dlq: { send: vi.fn() } satisfies IdentityDlqProducer,
      now: () => Date.parse('2026-08-31T23:00:01.000Z'),
    });

    await consume(batch(current.value));

    expect(resolve).toHaveBeenCalledTimes(1);
    expect(insertLinks).toHaveBeenCalledTimes(1);
    expect(current.ack).toHaveBeenCalledTimes(1);
    expect(current.retry).not.toHaveBeenCalled();
  });

  it('retries transient control-plane failures without ack', async () => {
    const current = message();
    const consume = createIdentityConsumer({
      repository: {
        resolve: vi.fn(async () => {
          throw new Error('network');
        }),
      },
      writer: { insertLinks: vi.fn() },
      dlq: { send: vi.fn() },
    });

    await consume(batch(current.value));

    expect(current.retry).toHaveBeenCalledTimes(1);
    expect(current.ack).not.toHaveBeenCalled();
  });

  it('sends identity conflicts to DLQ before ack', async () => {
    const current = message();
    const dlqSend = vi.fn(async () => undefined);
    const consume = createIdentityConsumer({
      repository: {
        resolve: vi.fn(async () => ({
          resolution_status: 'IDENTITY_CONFLICT' as const,
          person_id: null,
          person_created: false,
          visitor_link_created: false,
          linked_at: '2026-08-31T23:00:00.000Z',
          last_seen_at: '2026-08-31T23:00:00.000Z',
        })),
      },
      writer: { insertLinks: vi.fn() },
      dlq: { send: dlqSend },
      now: () => Date.parse('2026-08-31T23:00:01.000Z'),
    });

    await consume(batch(current.value));

    expect(dlqSend).toHaveBeenCalledTimes(1);
    expect(current.ack).toHaveBeenCalledTimes(1);
    expect(current.retry).not.toHaveBeenCalled();
  });
});
