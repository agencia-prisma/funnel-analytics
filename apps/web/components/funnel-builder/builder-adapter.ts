import {
  FUNNEL_DEFINITION_VERSION,
  FUNNEL_MODE_ORDERED,
  type FunnelDefinitionV1,
} from '@funnel/rule-engine';

import type {
  BuilderDraft,
  BuilderPosition,
  BuilderStep,
} from './builder-model';

const X_GAP = 300;
const Y = 160;

function fallbackPosition(index: number): BuilderPosition {
  return { x: 80 + index * X_GAP, y: Y };
}

export function definitionToBuilderSteps(
  definition: FunnelDefinitionV1,
  persistedPositions: Record<string, BuilderPosition> = {},
): BuilderStep[] {
  return definition.steps.map((step, index) => ({
    id: step.step_key,
    name: step.name,
    step_key: step.step_key,
    position: index + 1,
    rule: step.rule,
    canvas: persistedPositions[step.step_key] ?? fallbackPosition(index),
  }));
}

export function builderDraftToDefinition(
  draft: BuilderDraft,
): FunnelDefinitionV1 {
  const ordered = [...draft.steps].sort((a, b) => a.position - b.position);
  return {
    definition_version: FUNNEL_DEFINITION_VERSION,
    mode: FUNNEL_MODE_ORDERED,
    conversion_window_seconds: draft.conversionWindowSeconds,
    steps: ordered.map((step) => ({
      step_key: step.step_key,
      name: step.name.trim(),
      rule: step.rule,
    })),
  };
}

export function reorderSteps(
  steps: BuilderStep[],
  sourceIndex: number,
  targetIndex: number,
): BuilderStep[] {
  if (
    sourceIndex < 0 ||
    targetIndex < 0 ||
    sourceIndex >= steps.length ||
    targetIndex >= steps.length ||
    sourceIndex === targetIndex
  ) {
    return steps;
  }

  const next = [...steps].sort((a, b) => a.position - b.position);
  const [moved] = next.splice(sourceIndex, 1);
  if (!moved) return steps;
  next.splice(targetIndex, 0, moved);
  return next.map((step, index) => ({ ...step, position: index + 1 }));
}

export function duplicateStep(
  steps: BuilderStep[],
  stepId: string,
): BuilderStep[] {
  const ordered = [...steps].sort((a, b) => a.position - b.position);
  const index = ordered.findIndex((step) => step.id === stepId);
  const source = ordered[index];
  if (!source) return steps;

  let suffix = 2;
  let stepKey = `${source.step_key}_${suffix}`.slice(0, 64);
  const usedKeys = new Set(ordered.map((step) => step.step_key));
  while (usedKeys.has(stepKey)) {
    suffix += 1;
    stepKey = `${source.step_key}_${suffix}`.slice(0, 64);
  }

  const copy: BuilderStep = {
    ...source,
    id: `${stepKey}-${Date.now()}`,
    name: `${source.name} cópia`,
    step_key: stepKey,
    position: index + 2,
    canvas: { x: source.canvas.x + 40, y: source.canvas.y + 80 },
  };

  ordered.splice(index + 1, 0, copy);
  return ordered.map((step, itemIndex) => ({
    ...step,
    position: itemIndex + 1,
  }));
}
