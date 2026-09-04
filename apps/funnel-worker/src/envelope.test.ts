import { describe, expect, it } from 'vitest';

import { validateFunnelEnvelope } from './envelope';
import { FunnelWorkerError } from './errors';

const valid = {
  envelope_version: 1,
  request_id: '00000000-0000-4000-8000-000000000001',
  generated_at: '2026-09-04T12:00:00.000Z',
  workspace_id: '00000000-0000-4000-8000-000000000002',
  reason: 'journey_recomputed',
  journey_ids: ['00000000-0000-4000-8000-000000000003'],
  deleted_journey_ids: [],
  source_journey_version: '10',
} as const;

describe('Funnel recompute envelope', () => {
  it('accepts a valid envelope', () => {
    expect(validateFunnelEnvelope(valid)).toEqual(valid);
  });

  it('rejects an empty recompute', () => {
    expect(() =>
      validateFunnelEnvelope({
        ...valid,
        journey_ids: [],
        deleted_journey_ids: [],
      }),
    ).toThrowError(FunnelWorkerError);
  });

  it('rejects duplicated references across current and deleted sets', () => {
    expect(() =>
      validateFunnelEnvelope({
        ...valid,
        deleted_journey_ids: [...valid.journey_ids],
      }),
    ).toThrowError('FUNNEL_ENVELOPE_INVALID');
  });

  it('rejects invalid source Journey versions', () => {
    expect(() =>
      validateFunnelEnvelope({
        ...valid,
        source_journey_version: '0',
      }),
    ).toThrowError('FUNNEL_ENVELOPE_INVALID');
  });
});
