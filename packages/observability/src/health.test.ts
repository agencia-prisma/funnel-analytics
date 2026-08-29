import { describe, expect, it } from 'vitest';

import { createHealthPayload } from './health';

describe('createHealthPayload', () => {
  it('returns the stable health contract', () => {
    const payload = createHealthPayload({
      now: () => new Date('2026-08-29T20:00:00.000Z'),
      service: 'web',
      version: '0.1.0',
    });

    expect(payload).toEqual({
      service: 'web',
      status: 'ok',
      timestamp: '2026-08-29T20:00:00.000Z',
      version: '0.1.0',
    });
  });
});
