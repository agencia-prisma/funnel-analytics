import { describe, expect, it, vi } from 'vitest';

import { createCommerceConsumer } from './consumer';

const envelope = {
  envelope_version: 1 as const,
  request_id: '73000000-0000-4000-8000-000000000001',
  generated_at: '2026-09-05T10:00:00.000Z',
  workspace_id: '73000000-0000-4000-8000-000000000002',
  reason: 'journey_recomputed' as const,
  journey_ids: ['73000000-0000-4000-8000-000000000003'],
  deleted_journey_ids: [],
  source_journey_version: '2',
};

function message(body: unknown = envelope) {
  return { body, attempts: 1, ack: vi.fn(), retry: vi.fn() };
}

function repository() {
  return {
    findJourney: vi.fn().mockResolvedValue({
      journeyId: envelope.journey_ids[0],
      personId: null,
      testMode: false,
    }),
    findEvents: vi.fn().mockResolvedValue([
      {
        event_id: '73000000-0000-4000-8000-000000000101',
        session_id: '73000000-0000-4000-8000-000000000102',
        visitor_id: '73000000-0000-4000-8000-000000000103',
        pixel_id: '73000000-0000-4000-8000-000000000104',
        occurred_at: '2026-09-05T10:00:00.000Z',
        received_at: '2026-09-05T10:00:00.000Z',
        event_name: 'custom_event',
        custom_event_name: 'purchase',
        test_mode: false,
        properties: {
          order_id: 'order-1',
          currency: 'BRL',
          value_minor: 10000,
        },
      },
    ]),
    replaceFacts: vi.fn().mockResolvedValue(undefined),
    tombstoneJourneyFacts: vi.fn().mockResolvedValue(undefined),
  };
}

describe('commerce consumer', () => {
  it('persists Commerce, publishes Attribution, then acks', async () => {
    const repo = repository();
    const dlq = { send: vi.fn().mockResolvedValue(undefined) };
    const attributionPublisher = { send: vi.fn().mockResolvedValue(undefined) };
    const msg = message();
    await createCommerceConsumer({
      repository: repo,
      dlq,
      attributionPublisher,
      now: () => Date.parse('2026-09-05T10:01:00.000Z'),
    })({
      messages: [msg],
    });
    expect(repo.replaceFacts).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceJourneyVersion: '2',
        revenue: [
          expect.objectContaining({
            order_id: 'order-1',
            net_amount_minor: 10000,
          }),
        ],
      }),
    );
    expect(attributionPublisher.send).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'commerce_recomputed',
        workspace_id: envelope.workspace_id,
        journey_ids: envelope.journey_ids,
        source_journey_version: '2',
      }),
    );
    expect(repo.replaceFacts.mock.invocationCallOrder[0]).toBeLessThan(
      attributionPublisher.send.mock.invocationCallOrder[0]!,
    );
    expect(attributionPublisher.send.mock.invocationCallOrder[0]).toBeLessThan(
      msg.ack.mock.invocationCallOrder[0]!,
    );
    expect(msg.ack).toHaveBeenCalledOnce();
    expect(msg.retry).not.toHaveBeenCalled();
  });

  it('retries and does not ack when Attribution publishing fails', async () => {
    const repo = repository();
    const msg = message();
    await createCommerceConsumer({
      repository: repo,
      dlq: { send: vi.fn().mockResolvedValue(undefined) },
      attributionPublisher: {
        send: vi.fn().mockRejectedValue(new Error('queue unavailable')),
      },
    })({ messages: [msg] });

    expect(repo.replaceFacts).toHaveBeenCalledOnce();
    expect(msg.retry).toHaveBeenCalledOnce();
    expect(msg.ack).not.toHaveBeenCalled();
  });

  it('sends invalid envelopes to DLQ and acks', async () => {
    const repo = repository();
    const dlq = { send: vi.fn().mockResolvedValue(undefined) };
    const msg = message({ invalid: true });
    await createCommerceConsumer({
      repository: repo,
      dlq,
      attributionPublisher: { send: vi.fn().mockResolvedValue(undefined) },
      now: () => 0,
    })({
      messages: [msg],
    });
    expect(dlq.send).toHaveBeenCalledWith(
      expect.objectContaining({ error_code: 'COMMERCE_ENVELOPE_INVALID' }),
    );
    expect(msg.ack).toHaveBeenCalledOnce();
  });
});
