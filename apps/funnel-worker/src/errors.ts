import type { PipelineFailureKind } from '@funnel/event-contracts';

export type FunnelWorkerErrorCode =
  | 'FUNNEL_ENVELOPE_INVALID'
  | 'FUNNEL_CONTROL_PLANE_CONFIG_MISSING'
  | 'FUNNEL_CONTROL_PLANE_URL_INVALID'
  | 'FUNNEL_CONTROL_PLANE_UNAVAILABLE'
  | 'FUNNEL_CONTROL_PLANE_INVALID_RESPONSE'
  | 'FUNNEL_DEFINITION_INVALID'
  | 'FUNNEL_JOURNEY_QUERY_UNAVAILABLE'
  | 'FUNNEL_EVENT_QUERY_UNAVAILABLE'
  | 'FUNNEL_FACTS_WRITE_UNAVAILABLE'
  | 'FUNNEL_FACTS_SCHEMA_INVALID'
  | 'FUNNEL_PROGRESSION_INPUT_INVALID'
  | 'FUNNEL_PROGRESSION_EVENT_INVALID'
  | 'FUNNEL_PROGRESSION_EVENT_DUPLICATE'
  | 'FUNNEL_PROGRESSION_INPUT_TOO_LARGE'
  | 'FUNNEL_DLQ_FAILED';

export class FunnelWorkerError extends Error {
  constructor(
    readonly kind: PipelineFailureKind,
    readonly code: FunnelWorkerErrorCode | string,
  ) {
    super(code);
    this.name = 'FunnelWorkerError';
  }
}

export function toFunnelWorkerError(error: unknown): FunnelWorkerError {
  if (error instanceof FunnelWorkerError) return error;

  const code =
    error instanceof Error && error.message.startsWith('FUNNEL_')
      ? error.message
      : 'FUNNEL_FACTS_WRITE_UNAVAILABLE';

  return new FunnelWorkerError('TRANSIENT', code);
}
