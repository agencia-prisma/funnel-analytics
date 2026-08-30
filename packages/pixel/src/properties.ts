import type { JsonValue } from '@funnel/event-contracts';

export const CUSTOM_PROPERTY_LIMITS = {
  maxProperties: 30,
  maxKeyLength: 64,
  maxStringLength: 256,
  maxDepth: 3,
  maxArrayLength: 10,
} as const;

const PII_KEYS = new Set([
  'email',
  'phone',
  'telephone',
  'tel',
  'cpf',
  'document',
  'password',
  'pass',
  'card',
  'creditcard',
  'credit_card',
  'cvv',
]);

const RESERVED_KEYS = new Set([
  'event_id',
  'visitor_id',
  'session_id',
  'pixel_key',
  'occurred_at',
  'event_version',
  'sdk_version',
]);

function normalizedKey(key: string): string {
  return key.toLowerCase().replace(/[\s.-]/g, '');
}

function isBlockedKey(key: string): boolean {
  return (
    PII_KEYS.has(key.toLowerCase()) ||
    PII_KEYS.has(normalizedKey(key)) ||
    RESERVED_KEYS.has(key.toLowerCase())
  );
}

function sanitizeValue(value: unknown, depth: number): JsonValue | undefined {
  if (depth > CUSTOM_PROPERTY_LIMITS.maxDepth) {
    return undefined;
  }

  if (
    value === null ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  ) {
    return value as JsonValue;
  }

  if (typeof value === 'string') {
    return value.slice(0, CUSTOM_PROPERTY_LIMITS.maxStringLength);
  }

  if (Array.isArray(value)) {
    const values: JsonValue[] = [];

    for (const item of value.slice(0, CUSTOM_PROPERTY_LIMITS.maxArrayLength)) {
      const sanitized = sanitizeValue(item, depth + 1);

      if (sanitized !== undefined) {
        values.push(sanitized);
      }
    }

    return values;
  }

  if (typeof value === 'object' && value) {
    const result: Record<string, JsonValue> = {};
    let count = 0;

    for (const [key, item] of Object.entries(value)) {
      if (
        count >= CUSTOM_PROPERTY_LIMITS.maxProperties ||
        !key ||
        key.length > CUSTOM_PROPERTY_LIMITS.maxKeyLength ||
        isBlockedKey(key)
      ) {
        continue;
      }

      const sanitized = sanitizeValue(item, depth + 1);

      if (sanitized !== undefined) {
        result[key] = sanitized;
        count += 1;
      }
    }

    return result;
  }

  return undefined;
}

export function sanitizeCustomProperties(
  properties: unknown,
): Record<string, JsonValue> {
  if (!properties || typeof properties !== 'object' || Array.isArray(properties)) {
    return {};
  }

  return (sanitizeValue(properties, 0) ?? {}) as Record<string, JsonValue>;
}

export function isValidCustomEventName(value: string): boolean {
  return /^[a-zA-Z][a-zA-Z0-9_.:-]{0,63}$/.test(value);
}
