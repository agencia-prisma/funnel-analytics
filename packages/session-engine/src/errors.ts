import type { PipelineFailureKind } from '@funnel/event-contracts';

export type SessionErrorCode =
  | 'INVALID_SESSION_ENVELOPE'
  | 'UNSUPPORTED_SESSION_ENVELOPE_VERSION'
  | 'SESSION_INTEGRITY_VIOLATION'
  | 'SESSION_EVENTS_NOT_FOUND'
  | 'SESSION_QUERY_FAILED'
  | 'SESSION_INSERT_FAILED'
  | 'SESSION_BATCH_TOO_LARGE';

export class SessionEngineError extends Error {
  constructor(
    readonly kind: PipelineFailureKind,
    readonly code: SessionErrorCode,
  ) {
    super(code);
    this.name = 'SessionEngineError';
  }
}

export function toSessionEngineError(error: unknown): SessionEngineError {
  if (error instanceof SessionEngineError) {
    return error;
  }

  return new SessionEngineError('TRANSIENT', 'SESSION_QUERY_FAILED');
}
