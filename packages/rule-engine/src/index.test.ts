import { describe, expect, it } from 'vitest';

import {
  FUNNEL_DEFAULT_CONVERSION_WINDOW_SECONDS,
  RuleEngineError,
  evaluateFunnelRule,
  matchingFunnelStepKeys,
  validateFunnelDefinition,
  validateFunnelRule,
  type FunnelEventV1,
} from './index';

const event: FunnelEventV1 = {
  event_name: 'custom_event',
  custom_event_name: 'checkout_started',
  page_url: 'https://shop.example.com/checkout?coupon=SAVE10',
  page_path: '/checkout',
  page_title: 'Checkout',
  origin_host: 'shop.example.com',
  referrer_domain: 'instagram.com',
  utm_source: 'instagram',
  utm_medium: 'paid_social',
  utm_campaign: 'launch',
  utm_content: 'video_a',
  utm_term: null,
  device_type: 'mobile',
  browser_name: 'Chrome',
  os_name: 'Android',
  language: 'pt-BR',
  timezone: 'America/Sao_Paulo',
  test_mode: false,
  properties: {
    value: 149.9,
    coupon: 'SAVE10',
    product: {
      category: 'beauty',
    },
  },
};

describe('Rule Engine V1', () => {
  it('validates and normalizes an ordered funnel definition', () => {
    const definition = validateFunnelDefinition({
      definition_version: 1,
      mode: 'ordered',
      conversion_window_seconds: FUNNEL_DEFAULT_CONVERSION_WINDOW_SECONDS,
      steps: [
        {
          step_key: 'landing',
          name: ' Landing ',
          rule: {
            kind: 'condition',
            field: 'page_path',
            operator: 'equals',
            value: '/',
          },
        },
        {
          step_key: 'checkout',
          name: 'Checkout',
          rule: {
            kind: 'condition',
            field: 'custom_event_name',
            operator: 'equals',
            value: 'checkout_started',
          },
        },
      ],
    });

    expect(definition.steps[0]?.name).toBe('Landing');
    expect(definition.steps).toHaveLength(2);
  });

  it('matches static event fields', () => {
    const rule = validateFunnelRule({
      kind: 'group',
      combinator: 'all',
      rules: [
        {
          kind: 'condition',
          field: 'custom_event_name',
          operator: 'equals',
          value: 'checkout_started',
        },
        {
          kind: 'condition',
          field: 'page_path',
          operator: 'starts_with',
          value: '/check',
        },
      ],
    });

    expect(evaluateFunnelRule(rule, event)).toBe(true);
  });

  it('matches nested JSON properties without eval', () => {
    const rule = validateFunnelRule({
      kind: 'condition',
      field: 'properties.product.category',
      operator: 'equals',
      value: 'beauty',
    });

    expect(evaluateFunnelRule(rule, event)).toBe(true);
  });

  it('supports numeric comparisons for event properties', () => {
    const rule = validateFunnelRule({
      kind: 'condition',
      field: 'properties.value',
      operator: 'gte',
      value: 100,
    });

    expect(evaluateFunnelRule(rule, event)).toBe(true);
  });

  it('supports any and not composition', () => {
    const rule = validateFunnelRule({
      kind: 'not',
      rule: {
        kind: 'group',
        combinator: 'any',
        rules: [
          {
            kind: 'condition',
            field: 'utm_source',
            operator: 'equals',
            value: 'google',
          },
          {
            kind: 'condition',
            field: 'test_mode',
            operator: 'equals',
            value: true,
          },
        ],
      },
    });

    expect(evaluateFunnelRule(rule, event)).toBe(true);
  });

  it('supports membership and existence conditions', () => {
    const rule = validateFunnelRule({
      kind: 'group',
      combinator: 'all',
      rules: [
        {
          kind: 'condition',
          field: 'device_type',
          operator: 'in',
          value: ['mobile', 'tablet'],
        },
        {
          kind: 'condition',
          field: 'properties.coupon',
          operator: 'exists',
        },
      ],
    });

    expect(evaluateFunnelRule(rule, event)).toBe(true);
  });

  it('returns every matching step without progressing the funnel yet', () => {
    const definition = validateFunnelDefinition({
      definition_version: 1,
      mode: 'ordered',
      conversion_window_seconds: 3600,
      steps: [
        {
          step_key: 'paid_social',
          name: 'Paid Social',
          rule: {
            kind: 'condition',
            field: 'utm_medium',
            operator: 'equals',
            value: 'paid_social',
          },
        },
        {
          step_key: 'checkout',
          name: 'Checkout',
          rule: {
            kind: 'condition',
            field: 'custom_event_name',
            operator: 'equals',
            value: 'checkout_started',
          },
        },
      ],
    });

    expect(matchingFunnelStepKeys(definition, event)).toEqual([
      'paid_social',
      'checkout',
    ]);
  });

  it('rejects duplicate step keys', () => {
    expect(() =>
      validateFunnelDefinition({
        definition_version: 1,
        mode: 'ordered',
        conversion_window_seconds: 3600,
        steps: [
          {
            step_key: 'same',
            name: 'One',
            rule: {
              kind: 'condition',
              field: 'page_path',
              operator: 'equals',
              value: '/',
            },
          },
          {
            step_key: 'same',
            name: 'Two',
            rule: {
              kind: 'condition',
              field: 'page_path',
              operator: 'equals',
              value: '/checkout',
            },
          },
        ],
      }),
    ).toThrowError(RuleEngineError);
  });

  it('rejects unsafe property paths', () => {
    expect(() =>
      validateFunnelRule({
        kind: 'condition',
        field: 'properties.__proto__.polluted',
        operator: 'exists',
      }),
    ).toThrowError(RuleEngineError);
  });

  it('rejects incompatible operator values', () => {
    expect(() =>
      validateFunnelRule({
        kind: 'condition',
        field: 'properties.value',
        operator: 'gte',
        value: '100',
      }),
    ).toThrowError(RuleEngineError);
  });

  it('rejects excessive rule depth', () => {
    let rule: unknown = {
      kind: 'condition',
      field: 'page_path',
      operator: 'equals',
      value: '/',
    };

    for (let index = 0; index < 6; index += 1) {
      rule = { kind: 'not', rule };
    }

    expect(() => validateFunnelRule(rule)).toThrowError(
      'FUNNEL_RULE_TOO_COMPLEX',
    );
  });
});
