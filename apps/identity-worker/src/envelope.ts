import type {
  IdentityEnvelopeV1,
  ProtectedIdentifierV1,
} from '@funnel/event-contracts';

import { IdentityWorkerError } from './errors';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_V7_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BLIND_INDEX_PATTERN = /^[0-9a-f]{64}$/;
const CIPHERTEXT_PATTERN =
  /^aes256gcm\.[A-Za-z0-9_-]{16,24}\.[A-Za-z0-9_-]{20,6000}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateProtectedIdentifier(
  value: unknown,
): asserts value is ProtectedIdentifierV1 {
  if (
    !isRecord(value) ||
    !['email', 'phone', 'cpf', 'name'].includes(String(value.type)) ||
    typeof value.blind_index !== 'string' ||
    !BLIND_INDEX_PATTERN.test(value.blind_index) ||
    typeof value.encrypted_value !== 'string' ||
    !CIPHERTEXT_PATTERN.test(value.encrypted_value) ||
    !Number.isInteger(value.encryption_key_version) ||
    Number(value.encryption_key_version) < 1
  ) {
    throw new IdentityWorkerError(
      'PERMANENT',
      'IDENTITY_ENVELOPE_INVALID',
    );
  }
}

export function validateIdentityEnvelope(
  value: unknown,
): IdentityEnvelopeV1 {
  if (!isRecord(value)) {
    throw new IdentityWorkerError(
      'PERMANENT',
      'IDENTITY_ENVELOPE_INVALID',
    );
  }

  if (value.envelope_version !== 1) {
    throw new IdentityWorkerError(
      'PERMANENT',
      'IDENTITY_ENVELOPE_VERSION_UNSUPPORTED',
    );
  }

  if (
    typeof value.request_id !== 'string' ||
    !UUID_PATTERN.test(value.request_id) ||
    typeof value.received_at !== 'string' ||
    !Number.isFinite(Date.parse(value.received_at)) ||
    typeof value.workspace_id !== 'string' ||
    !UUID_PATTERN.test(value.workspace_id) ||
    typeof value.pixel_id !== 'string' ||
    !UUID_PATTERN.test(value.pixel_id) ||
    typeof value.visitor_id !== 'string' ||
    !UUID_V7_PATTERN.test(value.visitor_id) ||
    (value.session_id !== null &&
      (typeof value.session_id !== 'string' ||
        !UUID_V7_PATTERN.test(value.session_id))) ||
    value.source !== 'manual_browser_identify' ||
    value.confidence !== 'high' ||
    typeof value.test_mode !== 'boolean' ||
    !Array.isArray(value.encrypted_identifiers) ||
    value.encrypted_identifiers.length < 1 ||
    value.encrypted_identifiers.length > 4
  ) {
    throw new IdentityWorkerError(
      'PERMANENT',
      'IDENTITY_ENVELOPE_INVALID',
    );
  }

  const types = new Set<string>();

  for (const identifier of value.encrypted_identifiers) {
    validateProtectedIdentifier(identifier);

    if (types.has(identifier.type)) {
      throw new IdentityWorkerError(
        'PERMANENT',
        'IDENTITY_ENVELOPE_INVALID',
      );
    }

    types.add(identifier.type);
  }

  return value as unknown as IdentityEnvelopeV1;
}
