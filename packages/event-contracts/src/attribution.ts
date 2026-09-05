export const ATTRIBUTION_RECOMPUTE_V1_MAX_JOURNEY_IDS = 100;

export interface AttributionRecomputeEnvelopeV1 {
  envelope_version: 1;
  request_id: string;
  generated_at: string;
  workspace_id: string;
  reason: 'commerce_recomputed';
  journey_ids: string[];
  deleted_journey_ids: string[];
  source_journey_version: string;
}
