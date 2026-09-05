import { ATTRIBUTION_RECOMPUTE_V1_MAX_JOURNEY_IDS } from '@funnel/event-contracts/attribution';

import { AttributionWorkerError } from './errors';
import type { ValidatedAttributionEnvelope } from './types';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validUuidArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) => typeof item === 'string' && UUID_PATTERN.test(item),
    ) &&
    new Set(value).size === value.length
  );
}

export function validateAttributionEnvelope(
  value: unknown,
): ValidatedAttributionEnvelope {
  if (!isRecord(value)) {
    throw new AttributionWorkerError(
      'PERMANENT',
      'ATTRIBUTION_ENVELOPE_INVALID',
    );
  }
  const journeyIds = value.journey_ids;
  const deletedJourneyIds = value.deleted_journey_ids;
  if (
    value.envelope_version !== 1 ||
    value.reason !== 'commerce_recomputed' ||
    typeof value.request_id !== 'string' ||
    !UUID_PATTERN.test(value.request_id) ||
    typeof value.workspace_id !== 'string' ||
    !UUID_PATTERN.test(value.workspace_id) ||
    typeof value.generated_at !== 'string' ||
    !Number.isFinite(Date.parse(value.generated_at)) ||
    !validUuidArray(journeyIds) ||
    !validUuidArray(deletedJourneyIds) ||
    journeyIds.length + deletedJourneyIds.length < 1 ||
    journeyIds.length + deletedJourneyIds.length >
      ATTRIBUTION_RECOMPUTE_V1_MAX_JOURNEY_IDS ||
    journeyIds.some((journeyId) => deletedJourneyIds.includes(journeyId)) ||
    typeof value.source_journey_version !== 'string'
  ) {
    throw new AttributionWorkerError(
      'PERMANENT',
      'ATTRIBUTION_ENVELOPE_INVALID',
    );
  }
  try {
    if (BigInt(value.source_journey_version) < 1n) throw new Error('version');
  } catch {
    throw new AttributionWorkerError(
      'PERMANENT',
      'ATTRIBUTION_ENVELOPE_INVALID',
    );
  }
  return value as unknown as ValidatedAttributionEnvelope;
}
