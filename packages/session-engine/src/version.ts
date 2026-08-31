import { SessionEngineError } from './errors';

const SESSION_VERSION_EVENT_FACTOR = 1_000_000n;

export function sessionPartitionMonthFromUuidV7(sessionId: string): number {
  const compact = sessionId.replaceAll('-', '');

  if (
    compact.length !== 32 ||
    compact[12]?.toLowerCase() !== '7' ||
    !/^[0-9a-f]+$/i.test(compact)
  ) {
    throw new SessionEngineError('PERMANENT', 'SESSION_INTEGRITY_VIOLATION');
  }

  const timestampMs = Number(BigInt(`0x${compact.slice(0, 12)}`));
  const date = new Date(timestampMs);

  if (!Number.isFinite(date.getTime())) {
    throw new SessionEngineError('PERMANENT', 'SESSION_INTEGRITY_VIOLATION');
  }

  return date.getUTCFullYear() * 100 + date.getUTCMonth() + 1;
}

export function createSessionVersion(
  maxReceivedAtMs: number,
  eventCount: number,
): string {
  if (
    !Number.isSafeInteger(maxReceivedAtMs) ||
    maxReceivedAtMs < 0 ||
    !Number.isSafeInteger(eventCount) ||
    eventCount <= 0 ||
    eventCount >= Number(SESSION_VERSION_EVENT_FACTOR)
  ) {
    throw new SessionEngineError('PERMANENT', 'SESSION_INTEGRITY_VIOLATION');
  }

  return (
    BigInt(maxReceivedAtMs) * SESSION_VERSION_EVENT_FACTOR +
    BigInt(eventCount)
  ).toString();
}

export function isoFromEpochMs(value: number): string {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new SessionEngineError('PERMANENT', 'SESSION_INTEGRITY_VIOLATION');
  }

  return new Date(value).toISOString();
}
