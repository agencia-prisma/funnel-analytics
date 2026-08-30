import {
  EVENT_BATCH_V1_MAX_EVENTS,
  type BrowserEventV1,
  type EventBatchV1,
  type JsonValue,
} from '@funnel/event-contracts';
import {
  CUSTOM_PROPERTY_LIMITS,
  PII_CUSTOM_PROPERTY_KEYS,
  RESERVED_CUSTOM_PROPERTY_KEYS,
  isValidCustomEventName,
} from '@funnel/pixel/properties';

import { CollectorError } from './errors';

const UUID_V7_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PIXEL_KEY_PATTERN = /^px_pub_[0-9a-f]{36}$/;
const MAX_FUTURE_MS = 5 * 60 * 1000;
const MAX_PAST_MS = 7 * 24 * 60 * 60 * 1000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isBoundedString(
  value: unknown,
  maxLength: number,
  allowEmpty = true,
): value is string {
  return (
    typeof value === 'string' &&
    value.length <= maxLength &&
    (allowEmpty || value.length > 0)
  );
}

function isNullableBoundedString(
  value: unknown,
  maxLength: number,
): value is string | null {
  return value === null || isBoundedString(value, maxLength);
}

function isNonNegativeNumber(value: unknown, max = 100_000): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max;
}

function normalizedPropertyKey(key: string): string {
  return key.toLowerCase().replace(/[\s.-]/g, '');
}

function propertyKeyClassification(
  key: string,
): 'pii' | 'reserved' | 'allowed' {
  const lower = key.toLowerCase();
  const normalized = normalizedPropertyKey(key);

  if (
    PII_CUSTOM_PROPERTY_KEYS.has(lower) ||
    PII_CUSTOM_PROPERTY_KEYS.has(normalized)
  ) {
    return 'pii';
  }

  if (RESERVED_CUSTOM_PROPERTY_KEYS.has(lower)) {
    return 'reserved';
  }

  return 'allowed';
}

function validateJsonValue(value: unknown, depth: number): JsonValue {
  if (depth > CUSTOM_PROPERTY_LIMITS.maxDepth) {
    throw new CollectorError(422, 'INVALID_EVENT');
  }

  if (
    value === null ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  ) {
    return value as JsonValue;
  }

  if (typeof value === 'string') {
    if (value.length > CUSTOM_PROPERTY_LIMITS.maxStringLength) {
      throw new CollectorError(422, 'INVALID_EVENT');
    }

    return value;
  }

  if (Array.isArray(value)) {
    if (value.length > CUSTOM_PROPERTY_LIMITS.maxArrayLength) {
      throw new CollectorError(422, 'INVALID_EVENT');
    }

    return value.map((item) => validateJsonValue(item, depth + 1));
  }

  if (isRecord(value)) {
    const entries = Object.entries(value);

    if (entries.length > CUSTOM_PROPERTY_LIMITS.maxProperties) {
      throw new CollectorError(422, 'INVALID_EVENT');
    }

    const result: Record<string, JsonValue> = {};

    for (const [key, item] of entries) {
      if (!key || key.length > CUSTOM_PROPERTY_LIMITS.maxKeyLength) {
        throw new CollectorError(422, 'INVALID_EVENT');
      }

      const classification = propertyKeyClassification(key);

      if (classification === 'pii') {
        throw new CollectorError(422, 'PII_NOT_ALLOWED');
      }

      if (classification === 'reserved') {
        throw new CollectorError(422, 'INVALID_EVENT');
      }

      result[key] = validateJsonValue(item, depth + 1);
    }

    return result;
  }

  throw new CollectorError(422, 'INVALID_EVENT');
}

function validateTimestamp(value: unknown, now: number): string {
  if (typeof value !== 'string') {
    throw new CollectorError(422, 'INVALID_EVENT');
  }

  const timestamp = Date.parse(value);

  if (
    !Number.isFinite(timestamp) ||
    timestamp > now + MAX_FUTURE_MS ||
    timestamp < now - MAX_PAST_MS
  ) {
    throw new CollectorError(422, 'INVALID_EVENT');
  }

  return value;
}

function validateHttpUrl(value: unknown): string {
  if (!isBoundedString(value, 2_048, false)) {
    throw new CollectorError(422, 'INVALID_EVENT');
  }

  try {
    const url = new URL(value);

    if (
      (url.protocol !== 'https:' && url.protocol !== 'http:') ||
      url.username ||
      url.password
    ) {
      throw new Error('invalid');
    }

    return value;
  } catch {
    throw new CollectorError(422, 'INVALID_EVENT');
  }
}

function validateClickIds(value: unknown): Record<string, string> {
  if (!isRecord(value)) {
    throw new CollectorError(422, 'INVALID_EVENT');
  }

  const entries = Object.entries(value);

  if (entries.length > 10) {
    throw new CollectorError(422, 'INVALID_EVENT');
  }

  const result: Record<string, string> = {};

  for (const [key, item] of entries) {
    if (
      !/^[a-z0-9_]{1,32}$/i.test(key) ||
      !isBoundedString(item, 512, false)
    ) {
      throw new CollectorError(422, 'INVALID_EVENT');
    }

    result[key] = item;
  }

  return result;
}

function validateBaseEvent(
  value: Record<string, unknown>,
  now: number,
): Omit<BrowserEventV1, 'event_name'> & {
  event_name: BrowserEventV1['event_name'];
} {
  if (!UUID_V7_PATTERN.test(String(value.event_id ?? ''))) {
    throw new CollectorError(422, 'INVALID_EVENT');
  }

  if (value.event_version !== 1) {
    throw new CollectorError(422, 'UNSUPPORTED_EVENT_VERSION');
  }

  if (!isBoundedString(value.sdk_version, 64, false)) {
    throw new CollectorError(422, 'INVALID_EVENT');
  }

  if (
    typeof value.pixel_key !== 'string' ||
    !PIXEL_KEY_PATTERN.test(value.pixel_key)
  ) {
    throw new CollectorError(422, 'INVALID_EVENT');
  }

  if (
    !UUID_V7_PATTERN.test(String(value.visitor_id ?? '')) ||
    !UUID_V7_PATTERN.test(String(value.session_id ?? ''))
  ) {
    throw new CollectorError(422, 'INVALID_EVENT');
  }

  const eventName = value.event_name;

  if (eventName !== 'page_view' && eventName !== 'custom_event') {
    throw new CollectorError(422, 'INVALID_EVENT');
  }

  const occurredAt = validateTimestamp(value.occurred_at, now);
  const pageUrl = validateHttpUrl(value.page_url);

  if (
    !isBoundedString(value.page_path, 1_024) ||
    !isBoundedString(value.page_title, 256) ||
    !isNullableBoundedString(value.referrer, 2_048) ||
    !isNullableBoundedString(value.referrer_domain, 253) ||
    !isNullableBoundedString(value.utm_source, 512) ||
    !isNullableBoundedString(value.utm_medium, 512) ||
    !isNullableBoundedString(value.utm_campaign, 512) ||
    !isNullableBoundedString(value.utm_content, 512) ||
    !isNullableBoundedString(value.utm_term, 512) ||
    !isNullableBoundedString(value.language, 128) ||
    !isNullableBoundedString(value.timezone, 128) ||
    typeof value.test_mode !== 'boolean'
  ) {
    throw new CollectorError(422, 'INVALID_EVENT');
  }

  if (
    value.consent_state !== 'unknown' &&
    value.consent_state !== 'granted' &&
    value.consent_state !== 'denied'
  ) {
    throw new CollectorError(422, 'INVALID_EVENT');
  }

  if (
    !isRecord(value.device) ||
    !['mobile', 'tablet', 'desktop', 'unknown'].includes(
      String(value.device.type),
    ) ||
    !isRecord(value.browser) ||
    !isBoundedString(value.browser.name, 64) ||
    !isRecord(value.os) ||
    !isBoundedString(value.os.name, 64) ||
    !isRecord(value.screen) ||
    !isNonNegativeNumber(value.screen.width) ||
    !isNonNegativeNumber(value.screen.height) ||
    !isNonNegativeNumber(value.screen.device_pixel_ratio, 100) ||
    !isRecord(value.viewport) ||
    !isNonNegativeNumber(value.viewport.width) ||
    !isNonNegativeNumber(value.viewport.height)
  ) {
    throw new CollectorError(422, 'INVALID_EVENT');
  }

  return {
    event_id: value.event_id as string,
    event_name: eventName,
    event_version: 1,
    sdk_version: value.sdk_version,
    pixel_key: value.pixel_key,
    visitor_id: value.visitor_id as string,
    session_id: value.session_id as string,
    occurred_at: occurredAt,
    page_url: pageUrl,
    page_path: value.page_path,
    page_title: value.page_title,
    referrer: value.referrer,
    referrer_domain: value.referrer_domain,
    utm_source: value.utm_source,
    utm_medium: value.utm_medium,
    utm_campaign: value.utm_campaign,
    utm_content: value.utm_content,
    utm_term: value.utm_term,
    click_ids: validateClickIds(value.click_ids),
    device: {
      type: value.device.type as BrowserEventV1['device']['type'],
    },
    browser: {
      name: value.browser.name,
    },
    os: {
      name: value.os.name,
    },
    screen: {
      width: value.screen.width,
      height: value.screen.height,
      device_pixel_ratio: value.screen.device_pixel_ratio,
    },
    viewport: {
      width: value.viewport.width,
      height: value.viewport.height,
    },
    language: value.language,
    timezone: value.timezone,
    consent_state: value.consent_state,
    test_mode: value.test_mode,
  };
}

function validateEvent(value: unknown, now: number): BrowserEventV1 {
  if (!isRecord(value)) {
    throw new CollectorError(422, 'INVALID_EVENT');
  }

  const base = validateBaseEvent(value, now);

  if (base.event_name === 'page_view') {
    return {
      ...base,
      event_name: 'page_view',
    };
  }

  if (
    typeof value.custom_event_name !== 'string' ||
    !isValidCustomEventName(value.custom_event_name)
  ) {
    throw new CollectorError(422, 'INVALID_EVENT');
  }

  const properties = validateJsonValue(value.properties, 0);

  if (!isRecord(properties)) {
    throw new CollectorError(422, 'INVALID_EVENT');
  }

  return {
    ...base,
    event_name: 'custom_event',
    custom_event_name: value.custom_event_name,
    properties,
  };
}

export interface ValidatedBatch {
  batch: EventBatchV1;
  pixelKey: string;
}

export function validateEventBatch(
  value: unknown,
  now = Date.now(),
): ValidatedBatch {
  if (
    !isRecord(value) ||
    value.batch_version !== 1 ||
    !isBoundedString(value.sent_at, 64, false) ||
    !Array.isArray(value.events)
  ) {
    throw new CollectorError(422, 'INVALID_BATCH');
  }

  if (
    value.events.length === 0 ||
    value.events.length > EVENT_BATCH_V1_MAX_EVENTS
  ) {
    throw new CollectorError(422, 'INVALID_BATCH');
  }

  const events = value.events.map((event) => validateEvent(event, now));
  const ids = new Set<string>();
  const pixelKey = events[0].pixel_key;

  for (const event of events) {
    if (ids.has(event.event_id)) {
      throw new CollectorError(422, 'INVALID_BATCH');
    }

    ids.add(event.event_id);

    if (event.pixel_key !== pixelKey) {
      throw new CollectorError(422, 'INVALID_BATCH');
    }
  }

  return {
    batch: {
      batch_version: 1,
      sent_at: value.sent_at,
      events,
    },
    pixelKey,
  };
}

export function assertPageUrlsMatchOrigin(
  batch: EventBatchV1,
  originHost: string,
): void {
  for (const event of batch.events) {
    try {
      const pageHost = new URL(event.page_url).hostname.toLowerCase();

      if (pageHost !== originHost) {
        throw new CollectorError(403, 'ORIGIN_NOT_ALLOWED');
      }
    } catch (error) {
      if (error instanceof CollectorError) {
        throw error;
      }

      throw new CollectorError(403, 'ORIGIN_NOT_ALLOWED');
    }
  }
}
