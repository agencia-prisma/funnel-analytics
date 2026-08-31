import { describe, expect, it } from 'vitest';

import { validateCollectorEnvelope } from './envelope';
import { PipelineError } from './errors';
import { envelope, pageView } from './test-fixtures';

describe('CollectorEnvelopeV1 boundary validation', () => {
  it('accepts a valid Collector envelope', () => {
    expect(validateCollectorEnvelope(envelope())).toMatchObject({
      envelope_version: 1,
      source: 'browser',
    });
  });

  it('rejects unsupported envelope versions permanently', () => {
    expect(() =>
      validateCollectorEnvelope({
        ...envelope(),
        envelope_version: 2,
      }),
    ).toThrowError(
      expect.objectContaining({
        kind: 'PERMANENT',
        code: 'UNSUPPORTED_ENVELOPE_VERSION',
      }),
    );
  });

  it('rejects PII inside custom properties without logging values', () => {
    const custom = {
      ...pageView({
        event_id: '018bcfe5-6800-7000-8000-000000000004',
      }),
      event_name: 'custom_event',
      custom_event_name: 'lead_attempt',
      properties: {
        product: 'shoe',
        email: 'person@example.com',
      },
    };

    try {
      validateCollectorEnvelope(envelope({ events: [custom as never] }));
      throw new Error('expected PII rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(PipelineError);
      expect((error as PipelineError).code).toBe('PII_VIOLATION');
      expect(String(error)).not.toContain('person@example.com');
    }
  });

  it('rejects malformed ids and impossible envelopes', () => {
    expect(() =>
      validateCollectorEnvelope(
        envelope({
          workspace_id: '../unsafe',
        }),
      ),
    ).toThrowError(
      expect.objectContaining({
        kind: 'PERMANENT',
        code: 'INVALID_ENVELOPE',
      }),
    );
  });
});
