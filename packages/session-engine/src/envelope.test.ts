import { describe, expect, it } from 'vitest';

import { validateSessionRecomputeEnvelope } from './envelope';
import { recomputeEnvelope, TEST_SESSION_ID } from './test-fixtures';

describe('SessionRecomputeEnvelopeV1', () => {
  it('accepts a valid bounded envelope', () => {
    expect(validateSessionRecomputeEnvelope(recomputeEnvelope())).toMatchObject(
      {
        envelope_version: 1,
        session_ids: [TEST_SESSION_ID],
      },
    );
  });

  it('rejects unsupported versions permanently', () => {
    expect(() =>
      validateSessionRecomputeEnvelope({
        ...recomputeEnvelope(),
        envelope_version: 2,
      }),
    ).toThrowError(
      expect.objectContaining({
        kind: 'PERMANENT',
        code: 'UNSUPPORTED_SESSION_ENVELOPE_VERSION',
      }),
    );
  });

  it('rejects unbounded session lists', () => {
    expect(() =>
      validateSessionRecomputeEnvelope(
        recomputeEnvelope({
          session_ids: Array.from(
            { length: 101 },
            (_, index) =>
              `018bcfe5-6800-7000-8000-${String(index + 1).padStart(12, '0')}`,
          ),
        }),
      ),
    ).toThrowError(
      expect.objectContaining({
        code: 'INVALID_SESSION_ENVELOPE',
      }),
    );
  });
});
