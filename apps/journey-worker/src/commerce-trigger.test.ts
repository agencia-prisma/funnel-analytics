import type { IdentityLinkV1, SessionFactV1 } from '@funnel/event-contracts';
import { JOURNEY_POLICY_V1 } from '@funnel/journey-engine';
import { describe, expect, it, vi } from 'vitest';

import type { CommerceRecomputeProducer } from './commerce-publisher';
import { createJourneyConsumer } from './consumer';
import type { JourneyRepository } from './repository';
import type { JourneyQueueMessageLike } from './types';

const workspaceId = '75000000-0000-4000-8000-000000000001';
const visitorId = '75000000-0000-4000-8000-000000000002';
const sessionId = '75000000-0000-4000-8000-000000000003';

function session(): SessionFactV1 {
  return {
    workspace_id: workspaceId,
    pixel_id: '75000000-0000-4000-8000-000000000004',
    session_id: sessionId,
    visitor_id: visitorId,
    session_partition_month: 202609,
    session_started_at: '2026-09-05T10:00:00.000Z',
    last_activity_at: '2026-09-05T10:00:30.000Z',
    duration_seconds: 30,
    event_count: 2,
    page_view_count: 1,
    custom_event_count: 1,
    landing_page_url: 'https://example.com/product',
    landing_page_path: '/product',
    landing_page_title: 'Product',
    exit_page_url: 'https://example.com/checkout',
    exit_page_path: '/checkout',
    exit_page_title: 'Checkout',
    session_referrer: null,
    session_referrer_domain: null,
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
    utm_content: null,
    utm_term: null,
    fbclid: null,
    ttclid: null,
    gclid: null,
    msclkid: null,
    tblci: null,
    device_type: 'desktop',
    browser_name: 'Chrome',
    os_name: 'macOS',
    language: 'pt-BR',
    timezone: 'America/Sao_Paulo',
    test_mode: false,
    first_event_id: '75000000-0000-4000-8000-000000000101',
    last_event_id: '75000000-0000-4000-8000-000000000102',
    max_received_at: '2026-09-05T10:00:31.000Z',
    session_version: '5',
    updated_at: '2026-09-05T10:00:31.000Z',
  };
}

function repository(trace: string[]): JourneyRepository {
  return {
    async findIdentityForVisitors() {
      trace.push('identity');
      return [] as IdentityLinkV1[];
    },
    async findIdentityForPerson() {
      return [] as IdentityLinkV1[];
    },
    async findSessions() {
      trace.push('sessions');
      return [session()];
    },
    async previousState() {
      trace.push('previous');
      return { maxVersion: '9', journeyIds: [], sessionIds: [] };
    },
    async insertJourneyFacts() {
      trace.push('facts');
    },
    async insertSessionLinks() {
      trace.push('links');
    },
    async tombstoneJourneys() {
      trace.push('tombstones');
    },
  };
}

function message(trace: string[]): JourneyQueueMessageLike {
  return {
    body: {
      envelope_version: 1,
      request_id: '75000000-0000-4000-8000-000000000201',
      generated_at: '2026-09-05T10:01:00.000Z',
      workspace_id: workspaceId,
      reason: 'session_updated',
      visitor_ids: [visitorId],
      person_id: null,
    },
    attempts: 1,
    ack: vi.fn(() => trace.push('ack')),
    retry: vi.fn(() => trace.push('retry')),
  };
}

describe('Journey → Commerce recompute trigger', () => {
  it('publishes commerce after persistence and before upstream ack', async () => {
    const trace: string[] = [];
    const publisher: CommerceRecomputeProducer = {
      async send(envelope) {
        trace.push('commerce-publish');
        expect(envelope.workspace_id).toBe(workspaceId);
        expect(envelope.source_journey_version).toBe('10');
        expect(envelope.journey_ids).toHaveLength(1);
      },
    };
    const input = message(trace);
    const consume = createJourneyConsumer({
      repository: repository(trace),
      dlq: { send: vi.fn(async () => undefined) },
      commercePublisher: publisher,
      policy: JOURNEY_POLICY_V1,
      now: () => Date.parse('2026-09-05T10:02:00.000Z'),
    });

    await consume({ messages: [input] });

    expect(trace).toEqual([
      'identity',
      'sessions',
      'previous',
      'facts',
      'links',
      'tombstones',
      'commerce-publish',
      'ack',
    ]);
    expect(input.retry).not.toHaveBeenCalled();
  });

  it('retries upstream when commerce publishing fails', async () => {
    const trace: string[] = [];
    const input = message(trace);
    const consume = createJourneyConsumer({
      repository: repository(trace),
      dlq: { send: vi.fn(async () => undefined) },
      commercePublisher: {
        async send() {
          trace.push('commerce-publish-failed');
          throw new Error('queue unavailable');
        },
      },
      policy: JOURNEY_POLICY_V1,
    });

    await consume({ messages: [input] });

    expect(trace).toContain('commerce-publish-failed');
    expect(input.retry).toHaveBeenCalledTimes(1);
    expect(input.ack).not.toHaveBeenCalled();
  });
});
