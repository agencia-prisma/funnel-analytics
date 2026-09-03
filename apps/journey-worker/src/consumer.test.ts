import type { IdentityLinkV1, SessionFactV1 } from '@funnel/event-contracts';
import { JOURNEY_POLICY_V1 } from '@funnel/journey-engine';
import { describe, expect, it, vi } from 'vitest';

import { createJourneyConsumer } from './consumer';
import type { JourneyDlqProducer } from './dlq';
import { JourneyWorkerError } from './errors';
import type { JourneyRepository, PreviousJourneyState } from './repository';
import type { JourneyQueueMessageLike } from './types';

const workspaceId = '21000000-0000-0000-0000-000000000001';
const visitorId = '018f0000-0000-7000-8000-000000000001';
const sessionId = '018f0000-0000-7000-8000-000000000101';

const envelope = {
  envelope_version: 1,
  request_id: '10000000-0000-4000-8000-000000000001',
  generated_at: '2026-09-01T10:00:00.000Z',
  workspace_id: workspaceId,
  reason: 'session_updated',
  visitor_ids: [visitorId],
  person_id: null,
};

function message(body: unknown = envelope) {
  const ack = vi.fn();
  const retry = vi.fn();
  const value: JourneyQueueMessageLike = { body, attempts: 1, ack, retry };
  return { value, ack, retry };
}

function fact(): SessionFactV1 {
  return {
    workspace_id: workspaceId,
    pixel_id: '31000000-0000-0000-0000-000000000001',
    session_id: sessionId,
    visitor_id: visitorId,
    session_partition_month: 202609,
    session_started_at: '2026-09-01T10:00:00.000Z',
    last_activity_at: '2026-09-01T10:00:00.000Z',
    duration_seconds: 0,
    event_count: 1,
    page_view_count: 1,
    custom_event_count: 0,
    landing_page_url: null,
    landing_page_path: null,
    landing_page_title: null,
    exit_page_url: null,
    exit_page_path: null,
    exit_page_title: null,
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
    language: null,
    timezone: null,
    test_mode: false,
    first_event_id: '018f0000-0000-7000-8000-000000000201',
    last_event_id: '018f0000-0000-7000-8000-000000000201',
    max_received_at: '2026-09-01T10:00:00.000Z',
    session_version: '1',
    updated_at: '2026-09-01T10:00:00.000Z',
  };
}

function dependencies(options?: {
  queryError?: Error;
  writeError?: Error;
  previous?: PreviousJourneyState;
}) {
  const trace: string[] = [];
  const repository: JourneyRepository = {
    async findIdentityForVisitors() {
      trace.push('identity-visitors');
      if (options?.queryError) throw options.queryError;
      return [];
    },
    async findIdentityForPerson() {
      trace.push('identity-person');
      return [] as IdentityLinkV1[];
    },
    async findSessions() {
      trace.push('sessions');
      return [fact()];
    },
    async previousState() {
      trace.push('previous');
      return (
        options?.previous ?? { maxVersion: '0', journeyIds: [], sessionIds: [] }
      );
    },
    async insertJourneyFacts() {
      trace.push('facts');
      if (options?.writeError) throw options.writeError;
    },
    async insertSessionLinks() {
      trace.push('links');
    },
    async tombstoneJourneys() {
      trace.push('tombstones');
    },
  };

  const dlq: JourneyDlqProducer = {
    async send() {
      trace.push('dlq');
    },
  };

  return { repository, dlq, trace };
}

describe('Journey Worker consumer', () => {
  it('writes facts, links and tombstones before ack', async () => {
    const deps = dependencies();
    const current = message();
    const consume = createJourneyConsumer({
      ...deps,
      policy: JOURNEY_POLICY_V1,
      now: () => Date.parse('2026-09-01T10:01:00.000Z'),
    });

    await consume({ messages: [current.value] });

    expect(deps.trace).toEqual([
      'identity-visitors',
      'sessions',
      'previous',
      'facts',
      'links',
      'tombstones',
    ]);
    expect(current.ack).toHaveBeenCalledTimes(1);
    expect(current.retry).not.toHaveBeenCalled();
  });

  it('retries transient query/write failures without ack', async () => {
    const deps = dependencies({
      queryError: new JourneyWorkerError(
        'TRANSIENT',
        'JOURNEY_STORAGE_UNAVAILABLE',
      ),
    });
    const current = message();
    const consume = createJourneyConsumer({
      ...deps,
      policy: JOURNEY_POLICY_V1,
    });

    await consume({ messages: [current.value] });

    expect(current.retry).toHaveBeenCalledTimes(1);
    expect(current.ack).not.toHaveBeenCalled();
  });

  it('sends permanent invalid envelopes to DLQ', async () => {
    const deps = dependencies();
    const current = message({ nope: true });
    const consume = createJourneyConsumer({
      ...deps,
      policy: JOURNEY_POLICY_V1,
    });

    await consume({ messages: [current.value] });

    expect(deps.trace).toContain('dlq');
    expect(current.ack).toHaveBeenCalledTimes(1);
  });

  it('uses max existing version + 1 and tombstones stale journeys', async () => {
    const deps = dependencies({
      previous: {
        maxVersion: '41',
        journeyIds: ['61000000-0000-0000-0000-000000000001'],
        sessionIds: [sessionId],
      },
    });
    const facts = vi.spyOn(deps.repository, 'insertJourneyFacts');
    const tombstones = vi.spyOn(deps.repository, 'tombstoneJourneys');
    const current = message();
    const consume = createJourneyConsumer({
      ...deps,
      policy: JOURNEY_POLICY_V1,
      now: () => Date.parse('2026-09-01T10:01:00.000Z'),
    });

    await consume({ messages: [current.value] });

    expect(facts).toHaveBeenCalledWith(
      expect.any(Array),
      '42',
      expect.any(String),
    );
    expect(tombstones).toHaveBeenCalledWith(
      workspaceId,
      ['61000000-0000-0000-0000-000000000001'],
      '42',
      expect.any(String),
    );
  });
});
