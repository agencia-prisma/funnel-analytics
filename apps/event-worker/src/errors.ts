import type { PipelineFailureKind } from '@funnel/event-contracts';

export type PipelineErrorCode =
  | 'INVALID_ENVELOPE'
  | 'UNSUPPORTED_ENVELOPE_VERSION'
  | 'PII_VIOLATION'
  | 'RAW_ARCHIVE_FAILED'
  | 'CLICKHOUSE_FAILED'
  | 'CLICKHOUSE_BATCH_TOO_LARGE'
  | 'SESSION_QUEUE_FAILED'
  | 'DLQ_FAILED';

export class PipelineError extends Error {
  constructor(
    readonly kind: PipelineFailureKind,
    readonly code: PipelineErrorCode,
  ) {
    super(code);
    this.name = 'PipelineError';
  }
}

export function toPipelineError(error: unknown): PipelineError {
  if (error instanceof PipelineError) {
    return error;
  }

  return new PipelineError('TRANSIENT', 'CLICKHOUSE_FAILED');
}
