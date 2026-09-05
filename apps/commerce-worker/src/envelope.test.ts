import { describe, expect, it } from 'vitest';

import { CommerceWorkerError } from './errors';
import { validateCommerceEnvelope } from './envelope';

const valid = {
  envelope_version: 1,
  request_id: '72000000-0000-4000-8000-000000000001',
  generated_at: '2026-09-05T10:00:00.000Z',
  workspace_id: '72000000-0000-4000-8000-000000000002',
  reason: 'journey_recomputed',
  journey_ids: ['72000000-0000-4000-8000-000000000003'],
  deleted_journey_ids: [],
  source_journey_version: '1',
};

describe('commerce envelope', () => {
  it('accepts a valid recompute envelope', () => {
    expect(validateCommerceEnvelope(valid)).toEqual(valid);
  });

  it('rejects overlap between current and deleted journeys', () => {
    expect(() =>
      validateCommerceEnvelope({
        ...valid,
        deleted_journey_ids: valid.journey_ids,
      }),
    ).toThrowError(
      new CommerceWorkerError('PERMANENT', 'COMMERCE_ENVELOPE_INVALID'),
    );
  });
});
