import { describe, expect, it } from 'vitest';

import { CollectorError } from './errors';
import {
  TEST_NOW,
  validBatch,
  validPageView,
} from './test-fixtures';
import { validateEventBatch } from './validation';

function expectCode(operation: () => unknown, code: string) {
  try {
    operation();
    throw new Error('expected validation error');
  } catch (error) {
    expect(error).toBeInstanceOf(CollectorError);
    expect((error as CollectorError).code).toBe(code);
  }
}

describe('EventBatchV1 validation', () => {
  it('accepts a valid batch', () => {
    const result = validateEventBatch(validBatch(), TEST_NOW);

    expect(result.batch.events).toHaveLength(1);
    expect(result.pixelKey).toMatch(/^px_pub_/);
  });

  it('rejects an empty batch', () => {
    expectCode(
      () => validateEventBatch(validBatch([]), TEST_NOW),
      'INVALID_BATCH',
    );
  });

  it('rejects a batch over 20 events', () => {
    const events = Array.from({ length: 21 }, (_, index) =>
      validPageView({
        event_id: `018bcfe5-6800-7000-8000-${String(index + 1).padStart(12, '0')}`,
      }),
    );

    expectCode(
      () => validateEventBatch(validBatch(events), TEST_NOW),
      'INVALID_BATCH',
    );
  });

  it('rejects unsupported event versions', () => {
    const event = {
      ...validPageView(),
      event_version: 2,
    };

    expectCode(
      () => validateEventBatch(validBatch([event as never]), TEST_NOW),
      'UNSUPPORTED_EVENT_VERSION',
    );
  });

  it('rejects unknown event names', () => {
    const event = {
      ...validPageView(),
      event_name: 'purchase',
    };

    expectCode(
      () => validateEventBatch(validBatch([event as never]), TEST_NOW),
      'INVALID_EVENT',
    );
  });

  it('rejects duplicate event ids in one batch', () => {
    const first = validPageView();
    const second = validPageView({ page_path: '/checkout' });

    expectCode(
      () => validateEventBatch(validBatch([first, second]), TEST_NOW),
      'INVALID_BATCH',
    );
  });

  it('rejects mixed pixel keys in one batch', () => {
    const first = validPageView();
    const second = validPageView({
      event_id: '018bcfe5-6800-7000-8000-000000000004',
      pixel_key: 'px_pub_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    });

    expectCode(
      () => validateEventBatch(validBatch([first, second]), TEST_NOW),
      'INVALID_BATCH',
    );
  });

  it('rejects PII in custom properties', () => {
    const event = {
      ...validPageView({
        event_id: '018bcfe5-6800-7000-8000-000000000005',
      }),
      event_name: 'custom_event',
      custom_event_name: 'lead_attempt',
      properties: {
        product: 'shoe',
        email: 'person@example.com',
      },
    };

    expectCode(
      () => validateEventBatch(validBatch([event as never]), TEST_NOW),
      'PII_NOT_ALLOWED',
    );
  });

  it('rejects reserved fields in custom properties', () => {
    const event = {
      ...validPageView({
        event_id: '018bcfe5-6800-7000-8000-000000000006',
      }),
      event_name: 'custom_event',
      custom_event_name: 'cta',
      properties: {
        visitor_id: 'override',
      },
    };

    expectCode(
      () => validateEventBatch(validBatch([event as never]), TEST_NOW),
      'INVALID_EVENT',
    );
  });

  it('rejects timestamps too far in the future or past', () => {
    expectCode(
      () =>
        validateEventBatch(
          validBatch([
            validPageView({
              occurred_at: '2026-08-30T00:06:00.000Z',
            }),
          ]),
          TEST_NOW,
        ),
      'INVALID_EVENT',
    );

    expectCode(
      () =>
        validateEventBatch(
          validBatch([
            validPageView({
              occurred_at: '2026-08-22T23:59:59.000Z',
            }),
          ]),
          TEST_NOW,
        ),
      'INVALID_EVENT',
    );
  });
});
