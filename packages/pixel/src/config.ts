import { EVENT_BATCH_V1_MAX_EVENTS } from '@funnel/event-contracts';

import { isPixelPublicKey } from './public-key';

export const SDK_VERSION = '0.3.0';

export const PRODUCTION_COLLECTOR_ORIGIN =
  'https://funnel-analytics-collector-production.prismaag.workers.dev';
export const DEFAULT_EVENT_ENDPOINT = `${PRODUCTION_COLLECTOR_ORIGIN}/v1/events`;
export const DEFAULT_IDENTITY_ENDPOINT = `${PRODUCTION_COLLECTOR_ORIGIN}/v1/identify`;

export const DEFAULT_SESSION_TIMEOUT_MS = 30 * 60 * 1000;
export const DEFAULT_VISITOR_MAX_AGE_DAYS = 365;
export const DEFAULT_FLUSH_INTERVAL_MS = 5_000;
export const DEFAULT_MAX_BATCH_EVENTS = EVENT_BATCH_V1_MAX_EVENTS;
export const DEFAULT_MAX_QUEUE_EVENTS = 100;
export const DEFAULT_MAX_PAYLOAD_BYTES = 64 * 1024;
export const DEFAULT_MAX_RETRIES = 3;

export interface PixelConfig {
  pixelKey: string;
  endpoint: string | null;
  identityEndpoint: string | null;
  debug: boolean;
  testMode: boolean;
  testTransport: boolean;
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

function deriveIdentityEndpoint(
  explicit: string | undefined,
  eventEndpoint: string | null,
): string | null {
  if (explicit !== undefined) {
    return parseEndpoint(explicit);
  }

  if (!eventEndpoint) {
    return null;
  }

  try {
    const url = new URL(eventEndpoint);

    if (url.pathname.endsWith('/v1/events')) {
      url.pathname =
        url.pathname.slice(0, -'/v1/events'.length) + '/v1/identify';
    } else {
      url.pathname = '/v1/identify';
      url.search = '';
      url.hash = '';
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

  const endpoint =
    script?.dataset.endpoint === undefined
      ? DEFAULT_EVENT_ENDPOINT
      : parseEndpoint(script.dataset.endpoint);

  return {
    pixelKey,
    endpoint,
    identityEndpoint: deriveIdentityEndpoint(
      script?.dataset.identityEndpoint,
      endpoint,
    ),
    debug: parseBoolean(script?.dataset.debug),
    testMode: parseBoolean(script?.dataset.testMode),
    testTransport: parseBoolean(script?.dataset.testTransport),
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
