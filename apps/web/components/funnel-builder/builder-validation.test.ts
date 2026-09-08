import { describe, expect, it } from 'vitest';

import type { BuilderDraft } from './builder-model';
import { validateBuilderDraft } from './builder-validation';

function draft(): BuilderDraft {
  return {
    funnelId: 'funnel-1',
    baseVersion: 3,
    name: 'Checkout principal',
    description: '',
    conversionWindowSeconds: 3600,
    steps: [
      {
        id: 'a',
        name: 'Landing',
        step_key: 'landing',
        position: 1,
        canvas: { x: 0, y: 0 },
        rule: {
          kind: 'group',
          combinator: 'all',
          rules: [
            {
              kind: 'condition',
              field: 'event_name',
              operator: 'equals',
              value: 'page_view',
            },
            {
              kind: 'condition',
              field: 'page_path',
              operator: 'contains',
              value: '/oferta',
            },
          ],
        },
      },
      {
        id: 'b',
        name: 'Purchase',
        step_key: 'purchase',
        position: 2,
        canvas: { x: 300, y: 0 },
        rule: {
          kind: 'condition',
          field: 'event_name',
          operator: 'equals',
          value: 'purchase',
        },
      },
    ],
  };
}

describe('builder validation', () => {
  it('accepts a visual ALL rule that produces the canonical AST', () => {
    const result = validateBuilderDraft(draft());
    expect(result.valid).toBe(true);
    expect(result.definition?.steps[0]?.rule).toEqual(draft().steps[0]?.rule);
  });

  it('blocks duplicate step keys', () => {
    const input = draft();
    input.steps[1]!.step_key = 'landing';
    const result = validateBuilderDraft(input);
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.message.includes('duplicada'))).toBe(true);
  });

  it('blocks invalid rule values before publication', () => {
    const input = draft();
    input.steps[0]!.rule = {
      kind: 'condition',
      field: 'page_path',
      operator: 'gt',
      value: 'not-a-number' as unknown as number,
    };
    const result = validateBuilderDraft(input);
    expect(result.valid).toBe(false);
  });
});
