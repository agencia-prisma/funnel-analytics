export const COMMERCE_RECOMPUTE_V1_MAX_JOURNEY_IDS = 100;

export interface CommerceRecomputeEnvelopeV1 {
  envelope_version: 1;
  request_id: string;
  generated_at: string;
  workspace_id: string;
  reason: 'journey_recomputed';
  journey_ids: string[];
  deleted_journey_ids: string[];
  source_journey_version: string;
}
