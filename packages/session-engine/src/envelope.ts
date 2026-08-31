import {
  SESSION_RECOMPUTE_V1_MAX_SESSION_IDS,
  type SessionRecomputeEnvelopeV1,
} from '@funnel/event-contracts';

import { SessionEngineError } from './errors';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_V7_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function validateSessionRecomputeEnvelope(
  value: unknown,
): SessionRecomputeEnvelopeV1 {
  if (!isRecord(value)) {
    throw new SessionEngineError('PERMANENT', 'INVALID_SESSION_ENVELOPE');
  }

  if (value.envelope_version !== 1) {
    throw new SessionEngineError(
      'PERMANENT',
      'UNSUPPORTED_SESSION_ENVELOPE_VERSION',
    );
  }

  if (
    typeof value.request_id !== 'string' ||
    !UUID_PATTERN.test(value.request_id) ||
    typeof value.generated_at !== 'string' ||
    !Number.isFinite(Date.parse(value.generated_at)) ||
    typeof value.workspace_id !== 'string' ||
    !UUID_PATTERN.test(value.workspace_id) ||
    typeof value.pixel_id !== 'string' ||
    !UUID_PATTERN.test(value.pixel_id) ||
    !Array.isArray(value.session_ids) ||
    value.session_ids.length === 0 ||
    value.session_ids.length > SESSION_RECOMPUTE_V1_MAX_SESSION_IDS ||
    value.session_ids.some(
      (sessionId) =>
        typeof sessionId !== 'string' || !UUID_V7_PATTERN.test(sessionId),
    )
  ) {
    throw new SessionEngineError('PERMANENT', 'INVALID_SESSION_ENVELOPE');
  }

  return value as unknown as SessionRecomputeEnvelopeV1;
}
