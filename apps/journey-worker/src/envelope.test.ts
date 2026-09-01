import { describe, expect, it } from 'vitest';

import { validateJourneyEnvelope } from './envelope';

const valid = {
  envelope_version: 1,
  request_id: '10000000-0000-4000-8000-000000000001',
  generated_at: '2026-09-01T10:00:00.000Z',
  workspace_id: '21000000-0000-0000-0000-000000000001',
  reason: 'session_updated',
  visitor_ids: ['018f0000-0000-7000-8000-000000000001'],
  person_id: null,
};

describe('journey envelope', () => {
  it('accepts a PII-free subject reference envelope', () => {
    expect(validateJourneyEnvelope(valid)).toEqual(valid);
  });

  it('requires person_id for identity_linked', () => {
    expect(() =>
      validateJourneyEnvelope({ ...valid, reason: 'identity_linked' }),
    ).toThrowError('JOURNEY_ENVELOPE_INVALID');
  });

  it('rejects oversized reference batches', () => {
    expect(() =>
      validateJourneyEnvelope({
        ...valid,
        visitor_ids: Array.from(
          { length: 101 },
          (_, index) =>
            `018f0000-0000-7000-8000-${String(index + 1).padStart(12, '0')}`,
        ),
      }),
    ).toThrowError('JOURNEY_ENVELOPE_INVALID');
  });
});
