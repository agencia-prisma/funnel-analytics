import type { IdentityLinkV1, SessionFactV1 } from '@funnel/event-contracts';
import { describe, expect, it } from 'vitest';

import {
  JOURNEY_POLICY_V1,
  JourneyEngineError,
  reconstructJourneys,
} from './index';

const workspaceId = '21000000-0000-0000-0000-000000000001';
const workspaceB = '21000000-0000-0000-0000-000000000002';
const pixelA = '31000000-0000-0000-0000-000000000001';
const pixelB = '31000000-0000-0000-0000-000000000002';
const visitorA = '018f0000-0000-7000-8000-000000000001';
const visitorB = '018f0000-0000-7000-8000-000000000002';
const personId = '51000000-0000-0000-0000-000000000001';

function session(input: {
  id: string;
  visitor?: string;
  pixel?: string;
  start: string;
  end?: string;
  testMode?: boolean;
  workspace?: string;
  version?: string;
}): SessionFactV1 {
  const end = input.end ?? input.start;
  return {
    workspace_id: input.workspace ?? workspaceId,
    pixel_id: input.pixel ?? pixelA,
    session_id: input.id,
    visitor_id: input.visitor ?? visitorA,
    session_partition_month: 202609,
    session_started_at: input.start,
    last_activity_at: end,
    duration_seconds: Math.max(
      0,
      (Date.parse(end) - Date.parse(input.start)) / 1000,
    ),
    event_count: 2,
    page_view_count: 1,
    custom_event_count: 1,
    landing_page_url: 'https://example.com/landing',
    landing_page_path: '/landing',
    landing_page_title: 'Landing',
    exit_page_url: 'https://example.com/exit',
    exit_page_path: '/exit',
    exit_page_title: 'Exit',
    session_referrer: 'https://google.com/',
    session_referrer_domain: 'google.com',
    utm_source: 'meta',
    utm_medium: 'paid',
    utm_campaign: 'launch',
    utm_content: 'a',
    utm_term: 'term',
    fbclid: 'fb',
    ttclid: null,
    gclid: null,
    msclkid: null,
    tblci: null,
    device_type: 'desktop',
    browser_name: 'Chrome',
    os_name: 'macOS',
    language: 'pt-BR',
    timezone: 'America/Sao_Paulo',
    test_mode: input.testMode ?? false,
    first_event_id: '018f0000-0000-7000-8000-000000000010',
    last_event_id: '018f0000-0000-7000-8000-000000000011',
    max_received_at: end,
    session_version: input.version ?? '1',
    updated_at: end,
  };
}

function link(visitor = visitorA): IdentityLinkV1 {
  return {
    link_version: 1,
    workspace_id: workspaceId,
    person_id: personId,
    visitor_id: visitor,
    pixel_id: pixelA,
    source: 'manual_browser_identify',
    confidence: 'high',
    linked_at: '2026-09-01T10:00:00.000Z',
    last_seen_at: '2026-09-01T10:00:01.000Z',
  };
}

describe('Journey Engine', () => {
  it('creates a deterministic anonymous one-session Journey', async () => {
    const input = [
      session({
        id: '018f0000-0000-7000-8000-000000000101',
        start: '2026-09-01T10:00:00.000Z',
      }),
    ];
    const first = await reconstructJourneys({
      workspaceId,
      sessions: input,
      identityLinks: [],
      policy: JOURNEY_POLICY_V1,
    });
    const second = await reconstructJourneys({
      workspaceId,
      sessions: input,
      identityLinks: [],
      policy: JOURNEY_POLICY_V1,
    });

    expect(first.journeys).toHaveLength(1);
    expect(first.journeys[0]).toMatchObject({
      subject_kind: 'visitor',
      subject_id: visitorA,
      person_id: null,
      session_count: 1,
      visitor_count: 1,
    });
    expect(second).toEqual(first);
  });

  it('keeps exact inactivity boundary and overlapping sessions in one Journey', async () => {
    const policy = { version: 1 as const, inactivity_window_seconds: 60 };
    const result = await reconstructJourneys({
      workspaceId,
      identityLinks: [],
      policy,
      sessions: [
        session({
          id: '018f0000-0000-7000-8000-000000000101',
          start: '2026-09-01T10:00:00.000Z',
          end: '2026-09-01T10:01:00.000Z',
        }),
        session({
          id: '018f0000-0000-7000-8000-000000000102',
          start: '2026-09-01T10:02:00.000Z',
          end: '2026-09-01T10:03:00.000Z',
        }),
        session({
          id: '018f0000-0000-7000-8000-000000000103',
          start: '2026-09-01T10:02:30.000Z',
          end: '2026-09-01T10:04:00.000Z',
        }),
      ],
    });

    expect(result.journeys).toHaveLength(1);
    expect(result.sessionLinks.map((item) => item.sequence_index)).toEqual([
      0, 1, 2,
    ]);
  });

  it('starts a new Journey strictly after the inactivity window', async () => {
    const result = await reconstructJourneys({
      workspaceId,
      identityLinks: [],
      policy: { version: 1, inactivity_window_seconds: 60 },
      sessions: [
        session({
          id: '018f0000-0000-7000-8000-000000000101',
          start: '2026-09-01T10:00:00.000Z',
        }),
        session({
          id: '018f0000-0000-7000-8000-000000000102',
          start: '2026-09-01T10:01:00.001Z',
        }),
      ],
    });

    expect(result.journeys).toHaveLength(2);
  });

  it('merges multiple visitors and pixels for one Person while separating test_mode', async () => {
    const result = await reconstructJourneys({
      workspaceId,
      policy: JOURNEY_POLICY_V1,
      identityLinks: [link(visitorA), { ...link(visitorB), pixel_id: pixelB }],
      sessions: [
        session({
          id: '018f0000-0000-7000-8000-000000000101',
          visitor: visitorA,
          pixel: pixelA,
          start: '2026-09-01T10:00:00.000Z',
        }),
        session({
          id: '018f0000-0000-7000-8000-000000000102',
          visitor: visitorB,
          pixel: pixelB,
          start: '2026-09-01T10:20:00.000Z',
        }),
        session({
          id: '018f0000-0000-7000-8000-000000000103',
          visitor: visitorB,
          pixel: pixelB,
          testMode: true,
          start: '2026-09-01T10:30:00.000Z',
        }),
      ],
    });

    expect(result.journeys).toHaveLength(2);
    const production = result.journeys.find((item) => !item.test_mode);
    expect(production).toMatchObject({
      subject_kind: 'person',
      subject_id: personId,
      person_id: personId,
      visitor_count: 2,
      pixel_count: 2,
      session_count: 2,
    });
  });

  it('recomputes boundaries after a late session update', async () => {
    const policy = { version: 1 as const, inactivity_window_seconds: 60 };
    const s1 = session({
      id: '018f0000-0000-7000-8000-000000000101',
      start: '2026-09-01T10:00:00.000Z',
      end: '2026-09-01T10:00:00.000Z',
    });
    const s2 = session({
      id: '018f0000-0000-7000-8000-000000000102',
      start: '2026-09-01T10:01:30.000Z',
    });

    const before = await reconstructJourneys({
      workspaceId,
      sessions: [s1, s2],
      identityLinks: [],
      policy,
    });
    const after = await reconstructJourneys({
      workspaceId,
      sessions: [{ ...s1, last_activity_at: '2026-09-01T10:01:00.000Z' }, s2],
      identityLinks: [],
      policy,
    });

    expect(before.journeys).toHaveLength(2);
    expect(after.journeys).toHaveLength(1);
  });

  it('turns historical anonymous sessions into Person journeys after late identity', async () => {
    const sessions = [
      session({
        id: '018f0000-0000-7000-8000-000000000101',
        start: '2026-09-01T10:00:00.000Z',
      }),
      session({
        id: '018f0000-0000-7000-8000-000000000102',
        start: '2026-09-01T10:20:00.000Z',
      }),
    ];
    const anonymous = await reconstructJourneys({
      workspaceId,
      sessions,
      identityLinks: [],
      policy: JOURNEY_POLICY_V1,
    });
    const identified = await reconstructJourneys({
      workspaceId,
      sessions,
      identityLinks: [link()],
      policy: JOURNEY_POLICY_V1,
    });

    expect(anonymous.journeys[0]?.subject_kind).toBe('visitor');
    expect(identified.journeys[0]?.subject_kind).toBe('person');
    expect(identified.journeys[0]?.journey_id).not.toBe(
      anonymous.journeys[0]?.journey_id,
    );
  });

  it('rejects invalid policy and cross-Workspace input', async () => {
    await expect(
      reconstructJourneys({
        workspaceId,
        sessions: [],
        identityLinks: [],
        policy: { version: 1, inactivity_window_seconds: 0 },
      }),
    ).rejects.toBeInstanceOf(JourneyEngineError);

    await expect(
      reconstructJourneys({
        workspaceId,
        sessions: [
          session({
            id: '018f0000-0000-7000-8000-000000000101',
            workspace: workspaceB,
            start: '2026-09-01T10:00:00.000Z',
          }),
        ],
        identityLinks: [],
        policy: JOURNEY_POLICY_V1,
      }),
    ).rejects.toMatchObject({ code: 'JOURNEY_WORKSPACE_MISMATCH' });
  });

  it('handles empty input', async () => {
    await expect(
      reconstructJourneys({
        workspaceId,
        sessions: [],
        identityLinks: [],
        policy: JOURNEY_POLICY_V1,
      }),
    ).resolves.toEqual({ journeys: [], sessionLinks: [] });
  });
});
