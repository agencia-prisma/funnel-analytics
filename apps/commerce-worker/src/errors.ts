import type { PipelineFailureKind } from '@funnel/event-contracts';

export type CommerceWorkerErrorCode =
  | 'COMMERCE_ENVELOPE_INVALID'
  | 'COMMERCE_JOURNEY_QUERY_UNAVAILABLE'
  | 'COMMERCE_EVENT_QUERY_UNAVAILABLE'
  | 'COMMERCE_FACTS_WRITE_UNAVAILABLE'
  | 'COMMERCE_FACTS_SCHEMA_INVALID'
  | 'COMMERCE_ATTRIBUTION_PUBLISH_UNAVAILABLE'
  | 'COMMERCE_DLQ_FAILED';

export class CommerceWorkerError extends Error {
  constructor(
    readonly kind: PipelineFailureKind,
    readonly code: CommerceWorkerErrorCode | string,
  ) {
    super(code);
    this.name = 'CommerceWorkerError';
  }
}

export function toCommerceWorkerError(error: unknown): CommerceWorkerError {
  if (error instanceof CommerceWorkerError) return error;
  const code =
    error instanceof Error && error.message.startsWith('COMMERCE_')
      ? error.message
      : 'COMMERCE_FACTS_WRITE_UNAVAILABLE';
  return new CommerceWorkerError('TRANSIENT', code);
}
