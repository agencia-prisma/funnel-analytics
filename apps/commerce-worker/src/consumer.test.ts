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

describe('commerce consumer', () => {
  it('evaluates and persists a purchase then acks', async () => {
    const repository = {
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
          properties: { order_id: 'order-1', currency: 'BRL', value_minor: 10000 },
        },
      ]),
      replaceFacts: vi.fn().mockResolvedValue(undefined),
      tombstoneJourneyFacts: vi.fn().mockResolvedValue(undefined),
    };
    const dlq = { send: vi.fn().mockResolvedValue(undefined) };
    const msg = message();
    await createCommerceConsumer({ repository, dlq, now: () => Date.parse('2026-09-05T10:01:00.000Z') })({
      messages: [msg],
    });
    expect(repository.replaceFacts).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceJourneyVersion: '2',
        revenue: [expect.objectContaining({ order_id: 'order-1', net_amount_minor: 10000 })],
      }),
    );
    expect(msg.ack).toHaveBeenCalledOnce();
    expect(msg.retry).not.toHaveBeenCalled();
  });

  it('sends invalid envelopes to DLQ and acks', async () => {
    const repository = {
      findJourney: vi.fn(),
      findEvents: vi.fn(),
      replaceFacts: vi.fn(),
      tombstoneJourneyFacts: vi.fn(),
    };
    const dlq = { send: vi.fn().mockResolvedValue(undefined) };
    const msg = message({ invalid: true });
    await createCommerceConsumer({ repository, dlq, now: () => 0 })({ messages: [msg] });
    expect(dlq.send).toHaveBeenCalledWith(
      expect.objectContaining({ error_code: 'COMMERCE_ENVELOPE_INVALID' }),
    );
    expect(msg.ack).toHaveBeenCalledOnce();
  });
});
