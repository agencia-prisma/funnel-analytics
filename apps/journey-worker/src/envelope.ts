import {
  JOURNEY_RECOMPUTE_V1_MAX_REFERENCES,
  type JourneyRecomputeEnvelopeV1,
} from '@funnel/event-contracts';

import { JourneyWorkerError } from './errors';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function validateJourneyEnvelope(
  value: unknown,
): JourneyRecomputeEnvelopeV1 {
  if (
    !isRecord(value) ||
    value.envelope_version !== 1 ||
    typeof value.request_id !== 'string' ||
    !UUID_PATTERN.test(value.request_id) ||
    typeof value.generated_at !== 'string' ||
    !Number.isFinite(Date.parse(value.generated_at)) ||
    typeof value.workspace_id !== 'string' ||
    !UUID_PATTERN.test(value.workspace_id) ||
    !['session_updated', 'identity_linked'].includes(String(value.reason)) ||
    !Array.isArray(value.visitor_ids) ||
    value.visitor_ids.length < 1 ||
    value.visitor_ids.length > JOURNEY_RECOMPUTE_V1_MAX_REFERENCES ||
    value.visitor_ids.some(
      (id) => typeof id !== 'string' || !UUID_PATTERN.test(id),
    ) ||
    (value.person_id !== null &&
      (typeof value.person_id !== 'string' ||
        !UUID_PATTERN.test(value.person_id)))
  ) {
    throw new JourneyWorkerError('PERMANENT', 'JOURNEY_ENVELOPE_INVALID');
  }

  if (value.reason === 'identity_linked' && value.person_id === null) {
    throw new JourneyWorkerError('PERMANENT', 'JOURNEY_ENVELOPE_INVALID');
  }

  return value as unknown as JourneyRecomputeEnvelopeV1;
}
