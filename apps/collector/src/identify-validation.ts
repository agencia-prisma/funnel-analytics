import type {
  BrowserIdentifyIdentifiersV1,
  BrowserIdentifyRequestV1,
} from '@funnel/event-contracts';

import { CollectorError } from './errors';

const UUID_V7_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PIXEL_KEY_PATTERN = /^px_pub_[0-9a-f]{36}$/;
const MAX_FUTURE_MS = 5 * 60 * 1000;
const MAX_PAST_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_LENGTHS: Record<
  keyof BrowserIdentifyIdentifiersV1,
  number
> = {
  email: 320,
  phone: 64,
  cpf: 32,
  name: 200,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateIdentifiers(
  value: unknown,
): BrowserIdentifyIdentifiersV1 {
  if (!isRecord(value)) {
    throw new CollectorError(422, 'INVALID_IDENTITY');
  }

  const keys = Object.keys(value);

  if (
    keys.length === 0 ||
    keys.length > 4 ||
    keys.some(
      (key) => !['email', 'phone', 'cpf', 'name'].includes(key),
    )
  ) {
    throw new CollectorError(422, 'INVALID_IDENTITY');
  }

  const output: BrowserIdentifyIdentifiersV1 = {};

  for (const key of keys as Array<keyof BrowserIdentifyIdentifiersV1>) {
    const item = value[key];

    if (
      typeof item !== 'string' ||
      item.trim().length === 0 ||
      item.length > MAX_LENGTHS[key]
    ) {
      throw new CollectorError(422, 'INVALID_IDENTITY');
    }

    output[key] = item;
  }

  return output;
}

export function validateIdentifyRequest(
  value: unknown,
  now = Date.now(),
): BrowserIdentifyRequestV1 {
  if (!isRecord(value) || value.identify_version !== 1) {
    throw new CollectorError(422, 'INVALID_IDENTITY');
  }

  if (
    typeof value.pixel_key !== 'string' ||
    !PIXEL_KEY_PATTERN.test(value.pixel_key) ||
    typeof value.visitor_id !== 'string' ||
    !UUID_V7_PATTERN.test(value.visitor_id) ||
    (value.session_id !== null &&
      (typeof value.session_id !== 'string' ||
        !UUID_V7_PATTERN.test(value.session_id))) ||
    typeof value.sdk_version !== 'string' ||
    value.sdk_version.length < 1 ||
    value.sdk_version.length > 64 ||
    typeof value.test_mode !== 'boolean'
  ) {
    throw new CollectorError(422, 'INVALID_IDENTITY');
  }

  if (
    value.consent_state !== 'unknown' &&
    value.consent_state !== 'granted' &&
    value.consent_state !== 'denied'
  ) {
    throw new CollectorError(422, 'INVALID_IDENTITY');
  }

  if (value.consent_state === 'denied') {
    throw new CollectorError(403, 'IDENTIFICATION_CONSENT_DENIED');
  }

  if (typeof value.occurred_at !== 'string') {
    throw new CollectorError(422, 'INVALID_IDENTITY');
  }

  const occurredAt = Date.parse(value.occurred_at);

  if (
    !Number.isFinite(occurredAt) ||
    occurredAt > now + MAX_FUTURE_MS ||
    occurredAt < now - MAX_PAST_MS
  ) {
    throw new CollectorError(422, 'INVALID_IDENTITY');
  }

  return {
    identify_version: 1,
    pixel_key: value.pixel_key,
    visitor_id: value.visitor_id,
    session_id: value.session_id as string | null,
    occurred_at: value.occurred_at,
    identifiers: validateIdentifiers(value.identifiers),
    consent_state: value.consent_state,
    sdk_version: value.sdk_version,
    test_mode: value.test_mode,
  };
}
