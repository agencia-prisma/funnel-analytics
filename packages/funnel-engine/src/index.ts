import { uuidV5 } from '@funnel/journey-engine';
import {
  evaluateFunnelRule,
  validateFunnelDefinition,
  type FunnelDefinitionV1,
  type FunnelEventV1,
  type FunnelStepDefinitionV1,
} from '@funnel/rule-engine';

export const FUNNEL_ATTEMPT_NAMESPACE = '5baf7b32-90e1-5d42-8a1e-9f2f9f6ec4d2';
export const FUNNEL_MAX_EVENTS_PER_EVALUATION = 100_000;

export interface FunnelProgressionEventV1 extends FunnelEventV1 {
  event_id: string;
  session_id: string;
  visitor_id: string;
  pixel_id: string;
  occurred_at: string;
  received_at: string;
}

export interface FunnelStepHitDraft {
  workspace_id: string;
  funnel_id: string;
  funnel_version_id: string;
  funnel_version: number;
  journey_id: string;
  attempt_id: string;
  attempt_index: number;
  person_id: string | null;
  test_mode: boolean;
  step_key: string;
  step_position: number;
  event_id: string;
  session_id: string;
  visitor_id: string;
  pixel_id: string;
  entered_at: string;
  occurred_at: string;
  elapsed_ms: number;
}

export interface FunnelTransitionFactDraft {
  workspace_id: string;
  funnel_id: string;
  funnel_version_id: string;
  funnel_version: number;
  journey_id: string;
  attempt_id: string;
  attempt_index: number;
  person_id: string | null;
  test_mode: boolean;
  from_step_key: string;
  from_step_position: number;
  from_event_id: string;
  to_step_key: string;
  to_step_position: number;
  to_event_id: string;
  transition_ms: number;
  occurred_at: string;
}

export interface FunnelConversionFactDraft {
  workspace_id: string;
  funnel_id: string;
  funnel_version_id: string;
  funnel_version: number;
  journey_id: string;
  attempt_id: string;
  attempt_index: number;
  person_id: string | null;
  test_mode: boolean;
  entered_event_id: string;
  converted_event_id: string;
  entered_at: string;
  converted_at: string;
  conversion_ms: number;
  step_count: number;
}

export interface EvaluateFunnelProgressionInput {
  workspaceId: string;
  funnelId: string;
  funnelVersionId: string;
  funnelVersion: number;
  journeyId: string;
  personId: string | null;
  testMode: boolean;
  definition: FunnelDefinitionV1;
  events: FunnelProgressionEventV1[];
}

export interface EvaluateFunnelProgressionResult {
  stepHits: FunnelStepHitDraft[];
  transitions: FunnelTransitionFactDraft[];
  conversions: FunnelConversionFactDraft[];
}

export class FunnelProgressionError extends Error {
  constructor(
    readonly code:
      | 'FUNNEL_PROGRESSION_INPUT_INVALID'
      | 'FUNNEL_PROGRESSION_EVENT_INVALID'
      | 'FUNNEL_PROGRESSION_EVENT_DUPLICATE'
      | 'FUNNEL_PROGRESSION_INPUT_TOO_LARGE',
  ) {
    super(code);
    this.name = 'FunnelProgressionError';
  }
}

interface AttemptState {
  attemptId: string;
  attemptIndex: number;
  enteredAt: string;
  enteredAtMs: number;
  enteredEventId: string;
  lastStep: FunnelStepDefinitionV1;
  lastStepPosition: number;
  lastEvent: FunnelProgressionEventV1;
}

function timestamp(value: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new FunnelProgressionError('FUNNEL_PROGRESSION_EVENT_INVALID');
  }
  return parsed;
}

function compareEvents(
  left: FunnelProgressionEventV1,
  right: FunnelProgressionEventV1,
): number {
  return (
    timestamp(left.occurred_at) - timestamp(right.occurred_at) ||
    timestamp(left.received_at) - timestamp(right.received_at) ||
    left.event_id.localeCompare(right.event_id)
  );
}

function validateEvent(
  event: FunnelProgressionEventV1,
  testMode: boolean,
): void {
  if (
    !event.event_id ||
    !event.session_id ||
    !event.visitor_id ||
    !event.pixel_id ||
    event.test_mode !== testMode ||
    !event.event_name ||
    typeof event.properties !== 'object' ||
    event.properties === null ||
    Array.isArray(event.properties)
  ) {
    throw new FunnelProgressionError('FUNNEL_PROGRESSION_EVENT_INVALID');
  }

  timestamp(event.occurred_at);
  timestamp(event.received_at);
}

export async function deterministicFunnelAttemptId(input: {
  workspaceId: string;
  funnelVersionId: string;
  journeyId: string;
  attemptIndex: number;
  firstEventId: string;
}): Promise<string> {
  return uuidV5(
    FUNNEL_ATTEMPT_NAMESPACE,
    [
      input.workspaceId,
      input.funnelVersionId,
      input.journeyId,
      String(input.attemptIndex),
      input.firstEventId,
    ].join(':'),
  );
}

function stepHit(
  input: EvaluateFunnelProgressionInput,
  attempt: AttemptState,
  step: FunnelStepDefinitionV1,
  stepPosition: number,
  event: FunnelProgressionEventV1,
): FunnelStepHitDraft {
  return {
    workspace_id: input.workspaceId,
    funnel_id: input.funnelId,
    funnel_version_id: input.funnelVersionId,
    funnel_version: input.funnelVersion,
    journey_id: input.journeyId,
    attempt_id: attempt.attemptId,
    attempt_index: attempt.attemptIndex,
    person_id: input.personId,
    test_mode: input.testMode,
    step_key: step.step_key,
    step_position: stepPosition,
    event_id: event.event_id,
    session_id: event.session_id,
    visitor_id: event.visitor_id,
    pixel_id: event.pixel_id,
    entered_at: attempt.enteredAt,
    occurred_at: event.occurred_at,
    elapsed_ms: Math.max(0, timestamp(event.occurred_at) - attempt.enteredAtMs),
  };
}

export async function evaluateFunnelProgression(
  input: EvaluateFunnelProgressionInput,
): Promise<EvaluateFunnelProgressionResult> {
  if (
    !input.workspaceId ||
    !input.funnelId ||
    !input.funnelVersionId ||
    !input.journeyId ||
    !Number.isInteger(input.funnelVersion) ||
    input.funnelVersion < 1
  ) {
    throw new FunnelProgressionError('FUNNEL_PROGRESSION_INPUT_INVALID');
  }

  if (input.events.length > FUNNEL_MAX_EVENTS_PER_EVALUATION) {
    throw new FunnelProgressionError('FUNNEL_PROGRESSION_INPUT_TOO_LARGE');
  }

  const definition = validateFunnelDefinition(input.definition);
  const seenEventIds = new Set<string>();

  for (const event of input.events) {
    validateEvent(event, input.testMode);
    if (seenEventIds.has(event.event_id)) {
      throw new FunnelProgressionError('FUNNEL_PROGRESSION_EVENT_DUPLICATE');
    }
    seenEventIds.add(event.event_id);
  }

  const orderedEvents = [...input.events].sort(compareEvents);
  const stepHits: FunnelStepHitDraft[] = [];
  const transitions: FunnelTransitionFactDraft[] = [];
  const conversions: FunnelConversionFactDraft[] = [];
  const firstStep = definition.steps[0]!;
  const lastStepPosition = definition.steps.length;
  const windowMs = definition.conversion_window_seconds * 1000;
  let attempt: AttemptState | null = null;
  let attemptIndex = 0;

  const startAttempt = async (
    event: FunnelProgressionEventV1,
  ): Promise<AttemptState> => {
    attemptIndex += 1;
    const attemptId = await deterministicFunnelAttemptId({
      workspaceId: input.workspaceId,
      funnelVersionId: input.funnelVersionId,
      journeyId: input.journeyId,
      attemptIndex,
      firstEventId: event.event_id,
    });
    const state: AttemptState = {
      attemptId,
      attemptIndex,
      enteredAt: event.occurred_at,
      enteredAtMs: timestamp(event.occurred_at),
      enteredEventId: event.event_id,
      lastStep: firstStep,
      lastStepPosition: 1,
      lastEvent: event,
    };
    stepHits.push(stepHit(input, state, firstStep, 1, event));
    return state;
  };

  for (const event of orderedEvents) {
    const occurredAtMs = timestamp(event.occurred_at);

    if (attempt && occurredAtMs - attempt.enteredAtMs > windowMs) {
      attempt = null;
    }

    if (!attempt) {
      if (evaluateFunnelRule(firstStep.rule, event)) {
        attempt = await startAttempt(event);
      }
      continue;
    }

    const expectedPosition = attempt.lastStepPosition + 1;
    const expectedStep = definition.steps[expectedPosition - 1];
    if (!expectedStep) {
      attempt = null;
      continue;
    }

    if (!evaluateFunnelRule(expectedStep.rule, event)) {
      continue;
    }

    const transitionMs = Math.max(
      0,
      occurredAtMs - timestamp(attempt.lastEvent.occurred_at),
    );
    stepHits.push(
      stepHit(input, attempt, expectedStep, expectedPosition, event),
    );
    transitions.push({
      workspace_id: input.workspaceId,
      funnel_id: input.funnelId,
      funnel_version_id: input.funnelVersionId,
      funnel_version: input.funnelVersion,
      journey_id: input.journeyId,
      attempt_id: attempt.attemptId,
      attempt_index: attempt.attemptIndex,
      person_id: input.personId,
      test_mode: input.testMode,
      from_step_key: attempt.lastStep.step_key,
      from_step_position: attempt.lastStepPosition,
      from_event_id: attempt.lastEvent.event_id,
      to_step_key: expectedStep.step_key,
      to_step_position: expectedPosition,
      to_event_id: event.event_id,
      transition_ms: transitionMs,
      occurred_at: event.occurred_at,
    });

    attempt.lastStep = expectedStep;
    attempt.lastStepPosition = expectedPosition;
    attempt.lastEvent = event;

    if (expectedPosition === lastStepPosition) {
      conversions.push({
        workspace_id: input.workspaceId,
        funnel_id: input.funnelId,
        funnel_version_id: input.funnelVersionId,
        funnel_version: input.funnelVersion,
        journey_id: input.journeyId,
        attempt_id: attempt.attemptId,
        attempt_index: attempt.attemptIndex,
        person_id: input.personId,
        test_mode: input.testMode,
        entered_event_id: attempt.enteredEventId,
        converted_event_id: event.event_id,
        entered_at: attempt.enteredAt,
        converted_at: event.occurred_at,
        conversion_ms: Math.max(0, occurredAtMs - attempt.enteredAtMs),
        step_count: lastStepPosition,
      });
      attempt = null;
    }
  }

  return { stepHits, transitions, conversions };
}
