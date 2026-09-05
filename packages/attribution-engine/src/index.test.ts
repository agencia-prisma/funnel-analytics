import { describe, expect, it } from 'vitest';

import {
  ATTRIBUTION_CREDIT_MICROS,
  AttributionEngineError,
  evaluateAttribution,
  type AttributionOrderV1,
  type AttributionSourceEventV1,
} from './index';

const workspaceId = '00000000-0000-7000-8000-000000000001';
const journeyId = '00000000-0000-7000-8000-000000000002';

function event(
  input: Partial<AttributionSourceEventV1> &
    Pick<AttributionSourceEventV1, 'event_id' | 'session_id' | 'occurred_at'>,
): AttributionSourceEventV1 {
  return {
    received_at: input.occurred_at,
    test_mode: true,
    page_url: 'https://example.com/',
    page_path: '/',
    referrer_domain: null,
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
    ...input,
  };
}

function order(
  overrides: Partial<AttributionOrderV1> = {},
): AttributionOrderV1 {
  return {
    workspace_id: workspaceId,
    journey_id: journeyId,
    person_id: null,
    provider: 'custom',
    order_id: 'order-1',
    currency: 'BRL',
    status: 'partially_refunded',
    purchase_event_id: '00000000-0000-7000-8000-000000000103',
    purchased_at: '2026-09-05T12:00:00.000Z',
    gross_amount_minor: 15_990,
    refunded_amount_minor: 4_000,
    net_amount_minor: 11_990,
    test_mode: true,
    ...overrides,
  };
}

describe('evaluateAttribution', () => {
  it('builds one acquisition touchpoint per session and applies all V1 models', () => {
    const events = [
      event({
        event_id: '00000000-0000-7000-8000-000000000101',
        session_id: '00000000-0000-7000-8000-000000000201',
        occurred_at: '2026-09-03T10:00:00.000Z',
        utm_source: 'Meta',
        utm_medium: 'paid_social',
        utm_campaign: 'launch',
        fbclid: 'fb-click-1',
      }),
      event({
        event_id: '00000000-0000-7000-8000-000000000102',
        session_id: '00000000-0000-7000-8000-000000000202',
        occurred_at: '2026-09-04T11:00:00.000Z',
        referrer_domain: 'partner.example',
      }),
      event({
        event_id: '00000000-0000-7000-8000-000000000103',
        session_id: '00000000-0000-7000-8000-000000000203',
        occurred_at: '2026-09-05T12:00:00.000Z',
      }),
    ];

    const result = evaluateAttribution({
      order: order(),
      events,
      lookbackWindowSeconds: 30 * 24 * 60 * 60,
    });

    expect(result.touchpoints).toMatchObject([
      {
        sequence_index: 1,
        source: 'meta',
        medium: 'paid_social',
        channel: 'paid_social',
        click_id_type: 'fbclid',
        is_direct: false,
      },
      {
        sequence_index: 2,
        source: 'partner.example',
        medium: 'referral',
        channel: 'referral',
        is_direct: false,
      },
      {
        sequence_index: 3,
        source: 'direct',
        medium: null,
        channel: 'direct',
        is_direct: true,
      },
    ]);

    const first = result.facts.filter(
      (fact) => fact.attribution_model === 'first_touch',
    );
    const last = result.facts.filter(
      (fact) => fact.attribution_model === 'last_touch',
    );
    const lastNonDirect = result.facts.filter(
      (fact) => fact.attribution_model === 'last_non_direct',
    );
    const linear = result.facts.filter(
      (fact) => fact.attribution_model === 'linear',
    );

    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({
      touchpoint_index: 1,
      source: 'meta',
      credit_micros: ATTRIBUTION_CREDIT_MICROS,
      attributed_gross_amount_minor: 15_990,
      attributed_refunded_amount_minor: 4_000,
      attributed_net_amount_minor: 11_990,
    });
    expect(last).toHaveLength(1);
    expect(last[0]).toMatchObject({ touchpoint_index: 3, source: 'direct' });
    expect(lastNonDirect).toHaveLength(1);
    expect(lastNonDirect[0]).toMatchObject({
      touchpoint_index: 2,
      source: 'partner.example',
    });

    expect(linear.map((fact) => fact.credit_micros)).toEqual([
      333_334, 333_333, 333_333,
    ]);
    expect(linear.map((fact) => fact.attributed_gross_amount_minor)).toEqual([
      5_330, 5_330, 5_330,
    ]);
    expect(linear.map((fact) => fact.attributed_refunded_amount_minor)).toEqual(
      [1_334, 1_333, 1_333],
    );
    expect(linear.map((fact) => fact.attributed_net_amount_minor)).toEqual([
      3_997, 3_997, 3_996,
    ]);
    expect(linear.reduce((sum, fact) => sum + fact.credit_micros, 0)).toBe(
      ATTRIBUTION_CREDIT_MICROS,
    );
    expect(
      linear.reduce((sum, fact) => sum + fact.attributed_net_amount_minor, 0),
    ).toBe(11_990);
  });

  it('uses click IDs as deterministic paid-channel fallbacks', () => {
    const purchase = event({
      event_id: '00000000-0000-7000-8000-000000000103',
      session_id: '00000000-0000-7000-8000-000000000203',
      occurred_at: '2026-09-05T12:00:00.000Z',
      gclid: 'google-click-1',
    });

    const result = evaluateAttribution({
      order: order({ refunded_amount_minor: 0, net_amount_minor: 15_990 }),
      events: [purchase],
      lookbackWindowSeconds: 2_592_000,
    });

    expect(result.touchpoints[0]).toMatchObject({
      source: 'google',
      medium: 'cpc',
      channel: 'paid_search',
      click_id_type: 'gclid',
      click_id: 'google-click-1',
      is_direct: false,
    });
    expect(result.facts).toHaveLength(4);
  });

  it('inherits the supplied lookback window and excludes older sessions', () => {
    const events = [
      event({
        event_id: '00000000-0000-7000-8000-000000000100',
        session_id: '00000000-0000-7000-8000-000000000200',
        occurred_at: '2026-08-01T12:00:00.000Z',
        utm_source: 'old-source',
        utm_medium: 'cpc',
      }),
      event({
        event_id: '00000000-0000-7000-8000-000000000103',
        session_id: '00000000-0000-7000-8000-000000000203',
        occurred_at: '2026-09-05T12:00:00.000Z',
        utm_source: 'new-source',
        utm_medium: 'email',
      }),
    ];

    const result = evaluateAttribution({
      order: order({ refunded_amount_minor: 0, net_amount_minor: 15_990 }),
      events,
      lookbackWindowSeconds: 30 * 24 * 60 * 60,
    });

    expect(result.touchpoints).toHaveLength(1);
    expect(result.touchpoints[0]?.source).toBe('new-source');
  });

  it('falls back to the last direct touch for last_non_direct when needed', () => {
    const purchase = event({
      event_id: '00000000-0000-7000-8000-000000000103',
      session_id: '00000000-0000-7000-8000-000000000203',
      occurred_at: '2026-09-05T12:00:00.000Z',
    });
    const result = evaluateAttribution({
      order: order({ refunded_amount_minor: 0, net_amount_minor: 15_990 }),
      events: [purchase],
      lookbackWindowSeconds: 2_592_000,
    });
    const fact = result.facts.find(
      (candidate) => candidate.attribution_model === 'last_non_direct',
    );
    expect(fact).toMatchObject({ source: 'direct', is_direct: true });
  });

  it('rejects missing purchase source events', () => {
    expect(() =>
      evaluateAttribution({
        order: order(),
        events: [
          event({
            event_id: '00000000-0000-7000-8000-000000000999',
            session_id: '00000000-0000-7000-8000-000000000203',
            occurred_at: '2026-09-05T11:59:00.000Z',
          }),
        ],
        lookbackWindowSeconds: 2_592_000,
      }),
    ).toThrowError(
      expect.objectContaining<Partial<AttributionEngineError>>({
        code: 'ATTRIBUTION_PURCHASE_EVENT_MISSING',
      }),
    );
  });

  it('rejects inconsistent commerce money', () => {
    expect(() =>
      evaluateAttribution({
        order: order({ net_amount_minor: 15_990 }),
        events: [],
        lookbackWindowSeconds: 2_592_000,
      }),
    ).toThrowError(
      expect.objectContaining<Partial<AttributionEngineError>>({
        code: 'ATTRIBUTION_ORDER_INVALID',
      }),
    );
  });
});
