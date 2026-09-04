import { describe, expect, it } from 'vitest';

import {
  FunnelProgressionError,
  deterministicFunnelAttemptId,
  evaluateFunnelProgression,
  type FunnelProgressionEventV1,
} from './index';

const definition = {
  definition_version: 1 as const,
  mode: 'ordered' as const,
  conversion_window_seconds: 300,
  steps: [
    {
      step_key: 'landing',
      name: 'Landing',
      rule: {
        kind: 'condition' as const,
        field: 'page_path' as const,
        operator: 'equals' as const,
        value: '/product',
      },
    },
    {
      step_key: 'checkout',
      name: 'Checkout',
      rule: {
        kind: 'condition' as const,
        field: 'custom_event_name' as const,
        operator: 'equals' as const,
        value: 'checkout_started',
      },
    },
    {
      step_key: 'purchase',
      name: 'Purchase',
      rule: {
        kind: 'condition' as const,
        field: 'event_name' as const,
        operator: 'equals' as const,
        value: 'purchase',
      },
    },
  ],
};

function event(
  id: string,
  occurredAt: string,
  overrides: Partial<FunnelProgressionEventV1> = {},
): FunnelProgressionEventV1 {
  return {
    event_id: id,
    session_id: '00000000-0000-0000-0000-000000000010',
    visitor_id: '00000000-0000-0000-0000-000000000020',
    pixel_id: '00000000-0000-0000-0000-000000000030',
    occurred_at: occurredAt,
    received_at: occurredAt,
    event_name: 'page_view',
    custom_event_name: null,
    page_url: `https://shop.example.com${overrides.page_path ?? '/'}`,
    page_path: '/',
    page_title: 'Page',
    origin_host: 'shop.example.com',
    referrer_domain: null,
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
    utm_content: null,
    utm_term: null,
    device_type: 'mobile',
    browser_name: 'Chrome',
    os_name: 'Android',
    language: 'pt-BR',
    timezone: 'America/Sao_Paulo',
    test_mode: false,
    properties: {},
    ...overrides,
  };
}

const baseInput = {
  workspaceId: '00000000-0000-0000-0000-000000000001',
  funnelId: '00000000-0000-0000-0000-000000000002',
  funnelVersionId: '00000000-0000-0000-0000-000000000003',
  funnelVersion: 1,
  journeyId: '00000000-0000-0000-0000-000000000004',
  personId: null,
  testMode: false,
  definition,
};

describe('Funnel Progression Engine V1', () => {
  it('progresses through ordered steps and emits conversion facts', async () => {
    const result = await evaluateFunnelProgression({
      ...baseInput,
      events: [
        event('00000000-0000-0000-0000-000000000101', '2026-09-04T12:00:00.000Z', {
          page_path: '/product',
        }),
        event('00000000-0000-0000-0000-000000000102', '2026-09-04T12:00:20.000Z', {
          event_name: 'custom_event',
          custom_event_name: 'checkout_started',
        }),
        event('00000000-0000-0000-0000-000000000103', '2026-09-04T12:00:50.000Z', {
          event_name: 'purchase',
        }),
      ],
    });

    expect(result.stepHits.map((hit) => hit.step_key)).toEqual([
      'landing',
      'checkout',
      'purchase',
    ]);
    expect(result.transitions.map((fact) => fact.transition_ms)).toEqual([
      20_000,
      30_000,
    ]);
    expect(result.conversions).toHaveLength(1);
    expect(result.conversions[0]?.conversion_ms).toBe(50_000);
  });

  it('ignores later steps that occur before the expected step', async () => {
    const result = await evaluateFunnelProgression({
      ...baseInput,
      events: [
        event('00000000-0000-0000-0000-000000000111', '2026-09-04T12:00:00.000Z', {
          page_path: '/product',
        }),
        event('00000000-0000-0000-0000-000000000112', '2026-09-04T12:00:10.000Z', {
          event_name: 'purchase',
        }),
        event('00000000-0000-0000-0000-000000000113', '2026-09-04T12:00:20.000Z', {
          event_name: 'custom_event',
          custom_event_name: 'checkout_started',
        }),
        event('00000000-0000-0000-0000-000000000114', '2026-09-04T12:00:30.000Z', {
          event_name: 'purchase',
        }),
      ],
    });

    expect(result.stepHits.map((hit) => hit.event_id)).toEqual([
      '00000000-0000-0000-0000-000000000111',
      '00000000-0000-0000-0000-000000000113',
      '00000000-0000-0000-0000-000000000114',
    ]);
    expect(result.conversions).toHaveLength(1);
  });

  it('restarts after the conversion window expires', async () => {
    const result = await evaluateFunnelProgression({
      ...baseInput,
      definition: { ...definition, conversion_window_seconds: 60 },
      events: [
        event('00000000-0000-0000-0000-000000000121', '2026-09-04T12:00:00.000Z', {
          page_path: '/product',
        }),
        event('00000000-0000-0000-0000-000000000122', '2026-09-04T12:02:00.000Z', {
          event_name: 'custom_event',
          custom_event_name: 'checkout_started',
        }),
        event('00000000-0000-0000-0000-000000000123', '2026-09-04T12:03:00.000Z', {
          page_path: '/product',
        }),
        event('00000000-0000-0000-0000-000000000124', '2026-09-04T12:03:10.000Z', {
          event_name: 'custom_event',
          custom_event_name: 'checkout_started',
        }),
        event('00000000-0000-0000-0000-000000000125', '2026-09-04T12:03:20.000Z', {
          event_name: 'purchase',
        }),
      ],
    });

    expect(new Set(result.stepHits.map((hit) => hit.attempt_id)).size).toBe(2);
    expect(result.conversions).toHaveLength(1);
    expect(result.conversions[0]?.attempt_index).toBe(2);
  });

  it('supports multiple completed attempts in one Journey', async () => {
    const result = await evaluateFunnelProgression({
      ...baseInput,
      events: [
        event('00000000-0000-0000-0000-000000000131', '2026-09-04T12:00:00.000Z', {
          page_path: '/product',
        }),
        event('00000000-0000-0000-0000-000000000132', '2026-09-04T12:00:10.000Z', {
          event_name: 'custom_event',
          custom_event_name: 'checkout_started',
        }),
        event('00000000-0000-0000-0000-000000000133', '2026-09-04T12:00:20.000Z', {
          event_name: 'purchase',
        }),
        event('00000000-0000-0000-0000-000000000134', '2026-09-04T12:01:00.000Z', {
          page_path: '/product',
        }),
        event('00000000-0000-0000-0000-000000000135', '2026-09-04T12:01:10.000Z', {
          event_name: 'custom_event',
          custom_event_name: 'checkout_started',
        }),
        event('00000000-0000-0000-0000-000000000136', '2026-09-04T12:01:20.000Z', {
          event_name: 'purchase',
        }),
      ],
    });

    expect(result.conversions).toHaveLength(2);
    expect(result.conversions.map((fact) => fact.attempt_index)).toEqual([1, 2]);
  });

  it('allows one event to advance at most one step', async () => {
    const overlappingDefinition = {
      ...definition,
      steps: [
        {
          ...definition.steps[0],
          rule: {
            kind: 'condition' as const,
            field: 'event_name' as const,
            operator: 'equals' as const,
            value: 'custom_event',
          },
        },
        {
          ...definition.steps[1],
          rule: {
            kind: 'condition' as const,
            field: 'event_name' as const,
            operator: 'equals' as const,
            value: 'custom_event',
          },
        },
        definition.steps[2],
      ],
    };

    const result = await evaluateFunnelProgression({
      ...baseInput,
      definition: overlappingDefinition,
      events: [
        event('00000000-0000-0000-0000-000000000141', '2026-09-04T12:00:00.000Z', {
          event_name: 'custom_event',
        }),
      ],
    });

    expect(result.stepHits.map((hit) => hit.step_key)).toEqual(['landing']);
  });

  it('is deterministic even when input events are unsorted', async () => {
    const events = [
      event('00000000-0000-0000-0000-000000000151', '2026-09-04T12:00:00.000Z', {
        page_path: '/product',
      }),
      event('00000000-0000-0000-0000-000000000152', '2026-09-04T12:00:10.000Z', {
        event_name: 'custom_event',
        custom_event_name: 'checkout_started',
      }),
      event('00000000-0000-0000-0000-000000000153', '2026-09-04T12:00:20.000Z', {
        event_name: 'purchase',
      }),
    ];

    const first = await evaluateFunnelProgression({ ...baseInput, events });
    const second = await evaluateFunnelProgression({
      ...baseInput,
      events: [...events].reverse(),
    });

    expect(second).toEqual(first);
  });

  it('creates stable deterministic attempt IDs', async () => {
    const input = {
      workspaceId: baseInput.workspaceId,
      funnelVersionId: baseInput.funnelVersionId,
      journeyId: baseInput.journeyId,
      attemptIndex: 1,
      firstEventId: '00000000-0000-0000-0000-000000000161',
    };

    expect(await deterministicFunnelAttemptId(input)).toBe(
      await deterministicFunnelAttemptId(input),
    );
  });

  it('keeps incomplete attempts as step hits without conversion facts', async () => {
    const result = await evaluateFunnelProgression({
      ...baseInput,
      events: [
        event('00000000-0000-0000-0000-000000000171', '2026-09-04T12:00:00.000Z', {
          page_path: '/product',
        }),
        event('00000000-0000-0000-0000-000000000172', '2026-09-04T12:00:10.000Z', {
          event_name: 'custom_event',
          custom_event_name: 'checkout_started',
        }),
      ],
    });

    expect(result.stepHits).toHaveLength(2);
    expect(result.transitions).toHaveLength(1);
    expect(result.conversions).toHaveLength(0);
  });

  it('rejects duplicate event IDs', async () => {
    const duplicate = event(
      '00000000-0000-0000-0000-000000000181',
      '2026-09-04T12:00:00.000Z',
      { page_path: '/product' },
    );

    await expect(
      evaluateFunnelProgression({
        ...baseInput,
        events: [duplicate, duplicate],
      }),
    ).rejects.toMatchObject<FunnelProgressionError>({
      code: 'FUNNEL_PROGRESSION_EVENT_DUPLICATE',
    });
  });

  it('rejects events from a different test-mode partition', async () => {
    await expect(
      evaluateFunnelProgression({
        ...baseInput,
        events: [
          event('00000000-0000-0000-0000-000000000191', '2026-09-04T12:00:00.000Z', {
            test_mode: true,
            page_path: '/product',
          }),
        ],
      }),
    ).rejects.toMatchObject<FunnelProgressionError>({
      code: 'FUNNEL_PROGRESSION_EVENT_INVALID',
    });
  });
});
