import { describe, expect, it, vi } from 'vitest';

import { createAttributionConsumer } from './consumer';

const envelope = {
  envelope_version: 1 as const,
  request_id: '76000000-0000-4000-8000-000000000001',
  generated_at: '2026-09-05T10:00:00.000Z',
  workspace_id: '76000000-0000-4000-8000-000000000002',
  reason: 'commerce_recomputed' as const,
  journey_ids: ['76000000-0000-4000-8000-000000000003'],
  deleted_journey_ids: [],
  source_journey_version: '2',
};

const purchaseEventId = '76000000-0000-4000-8000-000000000101';
const sessionId = '76000000-0000-4000-8000-000000000102';

function message(body: unknown = envelope) {
  return { body, attempts: 1, ack: vi.fn(), retry: vi.fn() };
}

function repository(
  events = [
    {
      event_id: purchaseEventId,
      session_id: sessionId,
      occurred_at: '2026-09-05T10:00:00.000Z',
      received_at: '2026-09-05T10:00:00.000Z',
      test_mode: false,
      page_url: 'https://example.com/',
      page_path: '/',
      referrer_domain: null,
      utm_source: 'google',
      utm_medium: 'cpc',
      utm_campaign: 'brand',
      utm_content: null,
      utm_term: null,
      fbclid: null,
      ttclid: null,
      gclid: 'gclid-1',
      msclkid: null,
      tblci: null,
    },
  ],
) {
  return {
    findJourney: vi.fn().mockResolvedValue({
      journeyId: envelope.journey_ids[0],
      inactivityWindowSeconds: 2_592_000,
    }),
    findOrders: vi.fn().mockResolvedValue([
      {
        workspace_id: envelope.workspace_id,
        journey_id: envelope.journey_ids[0],
        person_id: null,
        provider: 'custom',
        order_id: 'order-1',
        currency: 'BRL',
        status: 'paid',
        purchase_event_id: purchaseEventId,
        purchased_at: '2026-09-05T10:00:00.000Z',
        gross_amount_minor: 10_000,
        refunded_amount_minor: 0,
        net_amount_minor: 10_000,
        test_mode: false,
      },
    ]),
    findEvents: vi.fn().mockResolvedValue(events),
    replaceJourneyFacts: vi.fn().mockResolvedValue(undefined),
    tombstoneJourneyFacts: vi.fn().mockResolvedValue(undefined),
  };
}

describe('attribution consumer', () => {
  it('evaluates all attribution models, persists, then acks', async () => {
    const repo = repository();
    const dlq = { send: vi.fn().mockResolvedValue(undefined) };
    const msg = message();

    await createAttributionConsumer({
      repository: repo,
      dlq,
      now: () => Date.parse('2026-09-05T10:01:00.000Z'),
    })({ messages: [msg] });

    expect(repo.replaceJourneyFacts).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceJourneyVersion: '2',
        facts: expect.arrayContaining([
          expect.objectContaining({
            order_id: 'order-1',
            attribution_model: 'first_touch',
            source: 'google',
            channel: 'paid_search',
            attributed_net_amount_minor: 10_000,
          }),
          expect.objectContaining({ attribution_model: 'last_touch' }),
          expect.objectContaining({ attribution_model: 'last_non_direct' }),
          expect.objectContaining({ attribution_model: 'linear' }),
        ]),
      }),
    );
    const call = repo.replaceJourneyFacts.mock.calls[0]?.[0];
    expect(call?.facts).toHaveLength(4);
    expect(msg.ack).toHaveBeenCalledOnce();
    expect(msg.retry).not.toHaveBeenCalled();
    expect(dlq.send).not.toHaveBeenCalled();
  });

  it('sends invalid envelopes to DLQ and acks', async () => {
    const repo = repository();
    const dlq = { send: vi.fn().mockResolvedValue(undefined) };
    const msg = message({ invalid: true });

    await createAttributionConsumer({ repository: repo, dlq, now: () => 0 })({
      messages: [msg],
    });

    expect(dlq.send).toHaveBeenCalledWith(
      expect.objectContaining({ error_code: 'ATTRIBUTION_ENVELOPE_INVALID' }),
    );
    expect(msg.ack).toHaveBeenCalledOnce();
  });

  it('dead-letters integrity failures instead of retrying forever', async () => {
    const repo = repository([]);
    const dlq = { send: vi.fn().mockResolvedValue(undefined) };
    const msg = message();

    await createAttributionConsumer({ repository: repo, dlq, now: () => 0 })({
      messages: [msg],
    });

    expect(dlq.send).toHaveBeenCalledWith(
      expect.objectContaining({
        error_code: 'ATTRIBUTION_PURCHASE_EVENT_MISSING',
        failure_kind: 'PERMANENT',
      }),
    );
    expect(msg.ack).toHaveBeenCalledOnce();
    expect(msg.retry).not.toHaveBeenCalled();
  });
});
