import type {
  BrowserEventV1,
  CollectorEnvelopeV1,
  JsonValue,
} from '@funnel/event-contracts';
import {
  CUSTOM_PROPERTY_LIMITS,
  PII_CUSTOM_PROPERTY_KEYS,
  RESERVED_CUSTOM_PROPERTY_KEYS,
} from '@funnel/pixel/properties';

import { PipelineError } from './errors';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_V7_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HOST_PATTERN =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizedKey(key: string): string {
  return key.toLowerCase().replace(/[\s.-]/g, '');
}

function validateProperties(value: unknown, depth = 0): JsonValue {
  if (depth > CUSTOM_PROPERTY_LIMITS.maxDepth) {
    throw new PipelineError('PERMANENT', 'INVALID_ENVELOPE');
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
      throw new PipelineError('PERMANENT', 'INVALID_ENVELOPE');
    }
    return value;
  }

  if (Array.isArray(value)) {
    if (value.length > CUSTOM_PROPERTY_LIMITS.maxArrayLength) {
      throw new PipelineError('PERMANENT', 'INVALID_ENVELOPE');
    }
    return value.map((item) => validateProperties(item, depth + 1));
  }

  if (isRecord(value)) {
    const entries = Object.entries(value);
    if (entries.length > CUSTOM_PROPERTY_LIMITS.maxProperties) {
      throw new PipelineError('PERMANENT', 'INVALID_ENVELOPE');
    }

    const output: Record<string, JsonValue> = {};

    for (const [key, item] of entries) {
      if (!key || key.length > CUSTOM_PROPERTY_LIMITS.maxKeyLength) {
        throw new PipelineError('PERMANENT', 'INVALID_ENVELOPE');
      }

      const lower = key.toLowerCase();
      const normalized = normalizedKey(key);

      if (
        PII_CUSTOM_PROPERTY_KEYS.has(lower) ||
        PII_CUSTOM_PROPERTY_KEYS.has(normalized)
      ) {
        throw new PipelineError('PERMANENT', 'PII_VIOLATION');
      }

      if (RESERVED_CUSTOM_PROPERTY_KEYS.has(lower)) {
        throw new PipelineError('PERMANENT', 'INVALID_ENVELOPE');
      }

      output[key] = validateProperties(item, depth + 1);
    }

    return output;
  }

  throw new PipelineError('PERMANENT', 'INVALID_ENVELOPE');
}

function validateEvent(value: unknown): asserts value is BrowserEventV1 {
  if (!isRecord(value)) {
    throw new PipelineError('PERMANENT', 'INVALID_ENVELOPE');
  }

  const requiredStrings = [
    'event_id',
    'sdk_version',
    'pixel_key',
    'visitor_id',
    'session_id',
    'occurred_at',
    'page_url',
    'page_path',
    'page_title',
  ];

  for (const field of requiredStrings) {
    if (typeof value[field] !== 'string') {
      throw new PipelineError('PERMANENT', 'INVALID_ENVELOPE');
    }
  }

  if (
    value.event_version !== 1 ||
    (value.event_name !== 'page_view' && value.event_name !== 'custom_event') ||
    !UUID_V7_PATTERN.test(value.event_id as string) ||
    !UUID_V7_PATTERN.test(value.visitor_id as string) ||
    !UUID_V7_PATTERN.test(value.session_id as string)
  ) {
    throw new PipelineError('PERMANENT', 'INVALID_ENVELOPE');
  }

  if (value.event_name === 'custom_event') {
    if (
      typeof value.custom_event_name !== 'string' ||
      !isRecord(value.properties)
    ) {
      throw new PipelineError('PERMANENT', 'INVALID_ENVELOPE');
    }

    validateProperties(value.properties);
  }
}

export function validateCollectorEnvelope(value: unknown): CollectorEnvelopeV1 {
  if (!isRecord(value)) {
    throw new PipelineError('PERMANENT', 'INVALID_ENVELOPE');
  }

  if (value.envelope_version !== 1) {
    throw new PipelineError('PERMANENT', 'UNSUPPORTED_ENVELOPE_VERSION');
  }

  if (
    typeof value.request_id !== 'string' ||
    !UUID_PATTERN.test(value.request_id) ||
    typeof value.received_at !== 'string' ||
    !Number.isFinite(Date.parse(value.received_at)) ||
    typeof value.collector_version !== 'string' ||
    typeof value.workspace_id !== 'string' ||
    !UUID_PATTERN.test(value.workspace_id) ||
    typeof value.pixel_id !== 'string' ||
    !UUID_PATTERN.test(value.pixel_id) ||
    typeof value.origin_host !== 'string' ||
    !HOST_PATTERN.test(value.origin_host) ||
    value.source !== 'browser' ||
    !Array.isArray(value.events) ||
    value.events.length === 0 ||
    value.events.length > 20
  ) {
    throw new PipelineError('PERMANENT', 'INVALID_ENVELOPE');
  }

  for (const event of value.events) {
    validateEvent(event);
  }

  return value as unknown as CollectorEnvelopeV1;
}
