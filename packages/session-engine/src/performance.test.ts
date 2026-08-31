import { describe, expect, it } from 'vitest';

import { buildSessionRecomputeEnvelopes } from './queue';
import { normalizedEvent } from './test-fixtures';

describe('sessionization performance smoke', () => {
  it('reduces 5,000 events across 250 sessions to bounded queue commands', () => {
    const startedAt = performance.now();
    const events = Array.from({ length: 5_000 }, (_, index) => {
      const sessionIndex = Math.floor(index / 20) + 1;

      return normalizedEvent({
        event_id: `018bcfe5-6800-7001-8000-${String(index + 1).padStart(12, '0')}`,
        session_id: `018bcfe5-6800-7002-8000-${String(sessionIndex).padStart(12, '0')}`,
      });
    });

    const envelopes = buildSessionRecomputeEnvelopes(
      events,
      '2026-08-31T18:00:02.000Z',
    );

    expect(envelopes).toHaveLength(3);
    expect(
      envelopes.reduce(
        (count, envelope) => count + envelope.session_ids.length,
        0,
      ),
    ).toBe(250);
    expect(performance.now() - startedAt).toBeLessThan(5_000);
  });
});
