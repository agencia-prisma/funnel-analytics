import { describe, expect, it } from 'vitest';

import { envelope } from './test-fixtures';
import { normalizeEnvelope } from './normalization';

describe('Event Worker performance smoke', () => {
  it('normalizes 5,000 browser events without a gross regression', () => {
    const startedAt = performance.now();
    let normalized = 0;

    for (let batch = 0; batch < 250; batch += 1) {
      const base = envelope();
      base.request_id =
        '550e8400-e29b-41d4-a716-' +
        String(batch + 1).padStart(12, '0');
      base.events = Array.from({ length: 20 }, (_, index) => ({
        ...base.events[0],
        event_id:
          '018bcfe5-6800-7000-8000-' +
          String(batch * 20 + index + 1).padStart(12, '0'),
      }));

      normalized += normalizeEnvelope(base).length;
    }

    expect(normalized).toBe(5_000);
    expect(performance.now() - startedAt).toBeLessThan(5_000);
  });
});
