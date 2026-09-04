import { FUNNEL_RECOMPUTE_V1_MAX_JOURNEY_IDS } from '@funnel/event-contracts/funnel';

import { FunnelWorkerError } from './errors';
import type { ValidatedFunnelEnvelope } from './types';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validUuidArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((item) => typeof item === 'string' && UUID_PATTERN.test(item)) &&
    new Set(value).size === value.length
  );
}

export function validateFunnelEnvelope(
  value: unknown,
): ValidatedFunnelEnvelope {
  if (!isRecord(value)) {
    throw new FunnelWorkerError('PERMANENT', 'FUNNEL_ENVELOPE_INVALID');
  }

  const journeyIds = value.journey_ids;
  const deletedJourneyIds = value.deleted_journey_ids;
  const generatedAt = value.generated_at;
  const sourceJourneyVersion = value.source_journey_version;

  if (
    value.envelope_version !== 1 ||
    value.reason !== 'journey_recomputed' ||
    typeof value.request_id !== 'string' ||
    !UUID_PATTERN.test(value.request_id) ||
    typeof value.workspace_id !== 'string' ||
    !UUID_PATTERN.test(value.workspace_id) ||
    typeof generatedAt !== 'string' ||
    !Number.isFinite(Date.parse(generatedAt)) ||
    !validUuidArray(journeyIds) ||
    !validUuidArray(deletedJourneyIds) ||
    journeyIds.length + deletedJourneyIds.length < 1 ||
    journeyIds.length + deletedJourneyIds.length >
      FUNNEL_RECOMPUTE_V1_MAX_JOURNEY_IDS ||
    journeyIds.some((journeyId) => deletedJourneyIds.includes(journeyId)) ||
    typeof sourceJourneyVersion !== 'string'
  ) {
    throw new FunnelWorkerError('PERMANENT', 'FUNNEL_ENVELOPE_INVALID');
  }

  try {
    if (BigInt(sourceJourneyVersion) < 1n) {
      throw new Error('version');
    }
  } catch {
    throw new FunnelWorkerError('PERMANENT', 'FUNNEL_ENVELOPE_INVALID');
  }

  return value as unknown as ValidatedFunnelEnvelope;
}
