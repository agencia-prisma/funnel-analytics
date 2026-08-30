import { isPixelPublicKey } from './public-key';

export const SDK_VERSION = '0.2.0';

export const DEFAULT_SESSION_TIMEOUT_MS = 30 * 60 * 1000;
export const DEFAULT_VISITOR_MAX_AGE_DAYS = 365;
export const DEFAULT_FLUSH_INTERVAL_MS = 5_000;
export const DEFAULT_MAX_BATCH_EVENTS = 20;
export const DEFAULT_MAX_QUEUE_EVENTS = 100;
export const DEFAULT_MAX_PAYLOAD_BYTES = 64 * 1024;
export const DEFAULT_MAX_RETRIES = 3;

export interface PixelConfig {
  pixelKey: string;
  endpoint: string | null;
  debug: boolean;
  testMode: boolean;
  requireConsent: boolean;
  sessionTimeoutMs: number;
  visitorMaxAgeDays: number;
  flushIntervalMs: number;
  maxBatchEvents: number;
  maxQueueEvents: number;
  maxPayloadBytes: number;
  maxRetries: number;
}

function parseBoolean(value: string | undefined): boolean {
  return value === '1' || value === 'true';
}

function parseEndpoint(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value, window.location.href);

    if (
      (url.protocol !== 'https:' && url.protocol !== 'http:') ||
      url.username ||
      url.password
    ) {
      return null;
    }

    return url.href;
  } catch {
    return null;
  }
}

export function readPixelConfig(
  script: HTMLScriptElement | null = document.currentScript as HTMLScriptElement | null,
): PixelConfig | null {
  const pixelKey = script?.dataset.pixelId?.trim() ?? '';

  if (!isPixelPublicKey(pixelKey)) {
    return null;
  }

  return {
    pixelKey,
    endpoint: parseEndpoint(script?.dataset.endpoint),
    debug: parseBoolean(script?.dataset.debug),
    testMode: parseBoolean(script?.dataset.testMode),
    requireConsent: parseBoolean(script?.dataset.consentRequired),
    sessionTimeoutMs: DEFAULT_SESSION_TIMEOUT_MS,
    visitorMaxAgeDays: DEFAULT_VISITOR_MAX_AGE_DAYS,
    flushIntervalMs: DEFAULT_FLUSH_INTERVAL_MS,
    maxBatchEvents: DEFAULT_MAX_BATCH_EVENTS,
    maxQueueEvents: DEFAULT_MAX_QUEUE_EVENTS,
    maxPayloadBytes: DEFAULT_MAX_PAYLOAD_BYTES,
    maxRetries: DEFAULT_MAX_RETRIES,
  };
}
