import { describe, expect, it } from 'vitest';

import { AttributionWorkerError } from './errors';
import { validateAttributionEnvelope } from './envelope';

const valid = {
  envelope_version: 1,
  request_id: '75000000-0000-4000-8000-000000000001',
  generated_at: '2026-09-05T10:00:00.000Z',
  workspace_id: '75000000-0000-4000-8000-000000000002',
  reason: 'commerce_recomputed',
  journey_ids: ['75000000-0000-4000-8000-000000000003'],
  deleted_journey_ids: [],
  source_journey_version: '1',
};

describe('attribution envelope', () => {
  it('accepts a valid commerce recompute envelope', () => {
    expect(validateAttributionEnvelope(valid)).toEqual(valid);
  });

  it('rejects overlap between current and deleted journeys', () => {
    expect(() =>
      validateAttributionEnvelope({
        ...valid,
        deleted_journey_ids: valid.journey_ids,
      }),
    ).toThrowError(
      new AttributionWorkerError('PERMANENT', 'ATTRIBUTION_ENVELOPE_INVALID'),
    );
  });
});
