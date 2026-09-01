export class JourneyWorkerError extends Error {
  constructor(
    readonly kind: 'PERMANENT' | 'TRANSIENT',
    readonly code: string,
  ) {
    super(code);
    this.name = 'JourneyWorkerError';
  }
}

export function toJourneyWorkerError(error: unknown): JourneyWorkerError {
  if (error instanceof JourneyWorkerError) return error;
  const message = error instanceof Error ? error.message : String(error);
  const permanent =
    /authentication|not enough privileges|unknown database|unknown table|syntax error|type mismatch|workspace mismatch|policy/i.test(
      message,
    );
  return new JourneyWorkerError(
    permanent ? 'PERMANENT' : 'TRANSIENT',
    permanent ? 'JOURNEY_INTEGRITY_VIOLATION' : 'JOURNEY_STORAGE_UNAVAILABLE',
  );
}
