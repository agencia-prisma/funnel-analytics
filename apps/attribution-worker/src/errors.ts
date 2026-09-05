import type { PipelineFailureKind } from '@funnel/event-contracts';

export type AttributionWorkerErrorCode =
  | 'ATTRIBUTION_ENVELOPE_INVALID'
  | 'ATTRIBUTION_JOURNEY_QUERY_UNAVAILABLE'
  | 'ATTRIBUTION_ORDER_QUERY_UNAVAILABLE'
  | 'ATTRIBUTION_EVENT_QUERY_UNAVAILABLE'
  | 'ATTRIBUTION_FACTS_WRITE_UNAVAILABLE'
  | 'ATTRIBUTION_FACTS_SCHEMA_INVALID'
  | 'ATTRIBUTION_DLQ_FAILED';

export class AttributionWorkerError extends Error {
  constructor(
    readonly kind: PipelineFailureKind,
    readonly code: AttributionWorkerErrorCode | string,
  ) {
    super(code);
    this.name = 'AttributionWorkerError';
  }
}

export function toAttributionWorkerError(
  error: unknown,
): AttributionWorkerError {
  if (error instanceof AttributionWorkerError) return error;
  const code =
    error instanceof Error && error.message.startsWith('ATTRIBUTION_')
      ? error.message
      : 'ATTRIBUTION_FACTS_WRITE_UNAVAILABLE';
  return new AttributionWorkerError('TRANSIENT', code);
}
