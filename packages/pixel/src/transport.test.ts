import type { EventBatchV1 } from '@funnel/event-contracts';
import { describe, expect, it } from 'vitest';

import { HttpTransport, isRetryableCollectorStatus } from './transport';

const emptyBatch: EventBatchV1 = {
  batch_version: 1,
  sent_at: '2026-08-30T00:00:00.000Z',
  events: [],
};

describe('collector transport status mapping', () => {
  it.each([429, 500, 502, 503, 504])('retries status %s', (status) => {
    expect(isRetryableCollectorStatus(status)).toBe(true);
  });

  it.each([400, 403, 404, 413, 422])(
    'does not retry status %s',
    (status) => {
      expect(isRetryableCollectorStatus(status)).toBe(false);
    },
  );

  it('classifies Collector responses through HttpTransport', async () => {
    const transport = new HttpTransport(
      'https://collector.example/v1/events',
      async () => new Response(null, { status: 422 }),
      {} as Navigator,
    );

    await expect(transport.send(emptyBatch)).resolves.toEqual({
      ok: false,
      retryable: false,
      status: 422,
    });
  });
});
