import { describe, expect, it, vi } from 'vitest';

import type { ActiveFunnelDefinition } from './control-plane';
import { createFunnelConsumer } from './consumer';
import { FunnelWorkerError } from './errors';
import type { FunnelFactsRepository } from './repository';
import type { FunnelQueueMessageLike } from './types';

const workspaceId = '00000000-0000-4000-8000-000000000001';
const journeyId = '00000000-0000-4000-8000-000000000002';
const funnelId = '00000000-0000-4000-8000-000000000003';
const funnelVersionId = '00000000-0000-4000-8000-000000000004';

const definition: ActiveFunnelDefinition = {
  funnelId,
  funnelVersionId,
  funnelVersion: 1,
  definition: {
    definition_version: 1,
    mode: 'ordered',
    conversion_window_seconds: 3600,
    steps: [
      {
        step_key: 'landing',
        name: 'Landing',
        rule: {
          kind: 'condition',
          field: 'page_path',
          operator: 'equals',
          value: '/product',
        },
      },
      {
        step_key: 'purchase',
        name: 'Purchase',
        rule: {
          kind: 'condition',
          field: 'event_name',
          operator: 'equals',
          value: 'purchase',
        },
      },
    ],
  },
};

function message(body: unknown): FunnelQueueMessageLike {
  return {
    body,
    attempts: 1,
    ack: vi.fn(),
    retry: vi.fn(),
  };
}

function validBody() {
  return {
    envelope_version: 1,
    request_id: '00000000-0000-4000-8000-000000000010',
    generated_at: '2026-09-04T12:00:00.000Z',
    workspace_id: workspaceId,
    reason: 'journey_recomputed',
    journey_ids: [journeyId],
    deleted_journey_ids: [],
    source_journey_version: '7',
  };
}

function repository(): FunnelFactsRepository & {
  replaceFacts: ReturnType<typeof vi.fn>;
  tombstoneJourneyFacts: ReturnType<typeof vi.fn>;
} {
  return {
    findJourney: vi.fn(async () => ({
      journeyId,
      personId: null,
      testMode: false,
    })),
    findEvents: vi.fn(async () => [
      {
        event_id: '00000000-0000-4000-8000-000000000101',
        session_id: '00000000-0000-4000-8000-000000000201',
        visitor_id: '00000000-0000-4000-8000-000000000301',
        pixel_id: '00000000-0000-4000-8000-000000000401',
        occurred_at: '2026-09-04T12:00:00.000Z',
        received_at: '2026-09-04T12:00:00.100Z',
        event_name: 'page_view',
        custom_event_name: null,
        page_url: 'https://example.com/product',
        page_path: '/product',
        page_title: 'Product',
        origin_host: 'example.com',
        referrer_domain: null,
        utm_source: null,
        utm_medium: null,
        utm_campaign: null,
        utm_content: null,
        utm_term: null,
        device_type: 'desktop',
        browser_name: 'Chrome',
        os_name: 'macOS',
        language: 'pt-BR',
        timezone: 'America/Sao_Paulo',
        test_mode: false,
        properties: {},
      },
      {
        event_id: '00000000-0000-4000-8000-000000000102',
        session_id: '00000000-0000-4000-8000-000000000201',
        visitor_id: '00000000-0000-4000-8000-000000000301',
        pixel_id: '00000000-0000-4000-8000-000000000401',
        occurred_at: '2026-09-04T12:01:00.000Z',
        received_at: '2026-09-04T12:01:00.100Z',
        event_name: 'purchase',
        custom_event_name: null,
        page_url: 'https://example.com/thanks',
        page_path: '/thanks',
        page_title: 'Thanks',
        origin_host: 'example.com',
        referrer_domain: null,
        utm_source: null,
        utm_medium: null,
        utm_campaign: null,
        utm_content: null,
        utm_term: null,
        device_type: 'desktop',
        browser_name: 'Chrome',
        os_name: 'macOS',
        language: 'pt-BR',
        timezone: 'America/Sao_Paulo',
        test_mode: false,
        properties: {},
      },
    ]),
    replaceFacts: vi.fn(async () => undefined),
    tombstoneJourneyFacts: vi.fn(async () => undefined),
  };
}

describe('Funnel Worker consumer', () => {
  it('evaluates active definitions, persists facts and acknowledges', async () => {
    const repo = repository();
    const input = message(validBody());
    const consume = createFunnelConsumer({
      controlPlane: { activeDefinitions: vi.fn(async () => [definition]) },
      repository: repo,
      dlq: { send: vi.fn(async () => undefined) },
      now: () => Date.parse('2026-09-04T12:02:00.000Z'),
    });

    await consume({ messages: [input] });

    expect(repo.replaceFacts).toHaveBeenCalledTimes(1);
    const persisted = repo.replaceFacts.mock.calls[0]?.[0];
    expect(persisted.stepHits).toHaveLength(2);
    expect(persisted.transitions).toHaveLength(1);
    expect(persisted.conversions).toHaveLength(1);
    expect(input.ack).toHaveBeenCalledTimes(1);
    expect(input.retry).not.toHaveBeenCalled();
  });

  it('tombstones facts for deleted Journeys', async () => {
    const repo = repository();
    const deletedId = '00000000-0000-4000-8000-000000000099';
    const input = message({
      ...validBody(),
      journey_ids: [],
      deleted_journey_ids: [deletedId],
    });
    const controlPlane = { activeDefinitions: vi.fn(async () => [definition]) };
    const consume = createFunnelConsumer({
      controlPlane,
      repository: repo,
      dlq: { send: vi.fn(async () => undefined) },
    });

    await consume({ messages: [input] });

    expect(repo.tombstoneJourneyFacts).toHaveBeenCalledWith(
      workspaceId,
      deletedId,
      '7',
      expect.any(String),
    );
    expect(controlPlane.activeDefinitions).not.toHaveBeenCalled();
    expect(input.ack).toHaveBeenCalledTimes(1);
  });

  it('retries transient storage failures without acknowledging', async () => {
    const repo = repository();
    repo.findEvents = vi.fn(async () => {
      throw new FunnelWorkerError(
        'TRANSIENT',
        'FUNNEL_EVENT_QUERY_UNAVAILABLE',
      );
    });
    const input = message(validBody());
    const consume = createFunnelConsumer({
      controlPlane: { activeDefinitions: vi.fn(async () => [definition]) },
      repository: repo,
      dlq: { send: vi.fn(async () => undefined) },
    });

    await consume({ messages: [input] });

    expect(input.retry).toHaveBeenCalledTimes(1);
    expect(input.ack).not.toHaveBeenCalled();
  });

  it('sends malformed envelopes to the DLQ and acknowledges them', async () => {
    const repo = repository();
    const input = message({ invalid: true });
    const dlq = { send: vi.fn(async () => undefined) };
    const consume = createFunnelConsumer({
      controlPlane: { activeDefinitions: vi.fn(async () => [definition]) },
      repository: repo,
      dlq,
      now: () => Date.parse('2026-09-04T12:02:00.000Z'),
    });

    await consume({ messages: [input] });

    expect(dlq.send).toHaveBeenCalledWith(
      expect.objectContaining({ error_code: 'FUNNEL_ENVELOPE_INVALID' }),
    );
    expect(input.ack).toHaveBeenCalledTimes(1);
    expect(input.retry).not.toHaveBeenCalled();
  });
});
