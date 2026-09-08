import { describe, expect, it } from 'vitest';

import {
  builderDraftToDefinition,
  definitionToBuilderSteps,
  reorderSteps,
} from './builder-adapter';
import type { BuilderDraft } from './builder-model';

const definition = {
  definition_version: 1 as const,
  mode: 'ordered' as const,
  conversion_window_seconds: 3600,
  steps: [
    {
      step_key: 'landing',
      name: 'Landing',
      rule: {
        kind: 'condition' as const,
        field: 'event_name' as const,
        operator: 'equals' as const,
        value: 'page_view',
      },
    },
    {
      step_key: 'checkout',
      name: 'Checkout',
      rule: {
        kind: 'condition' as const,
        field: 'page_path' as const,
        operator: 'contains' as const,
        value: '/checkout',
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

describe('funnel builder adapter', () => {
  it('round-trips canonical definition without depending on canvas coordinates', () => {
    const steps = definitionToBuilderSteps(definition, {
      landing: { x: 900, y: 12 },
      checkout: { x: -100, y: 44 },
      purchase: { x: 0, y: 999 },
    });
    const draft: BuilderDraft = {
      funnelId: 'funnel-1',
      baseVersion: 3,
      name: 'Checkout principal',
      description: '',
      conversionWindowSeconds: definition.conversion_window_seconds,
      steps,
    };

    expect(builderDraftToDefinition(draft)).toEqual(definition);
  });

  it('reorders step 1,2,3 into 1,3,2 with deterministic positions', () => {
    const steps = definitionToBuilderSteps(definition);
    const reordered = reorderSteps(steps, 2, 1);

    expect(reordered.map((step) => step.step_key)).toEqual([
      'landing',
      'purchase',
      'checkout',
    ]);
    expect(reordered.map((step) => step.position)).toEqual([1, 2, 3]);
  });
});
