import { describe, expect, it } from 'vitest';

import { buildSessionRecomputeEnvelopes } from './queue';
import { normalizedEvent } from './test-fixtures';

describe('session recompute queue commands', () => {
  it('deduplicates session IDs inside a Workspace/Pixel batch', () => {
    const events = [normalizedEvent(), normalizedEvent()];
    const envelopes = buildSessionRecomputeEnvelopes(
      events,
      '2026-08-31T18:00:02.000Z',
      () => '550e8400-e29b-41d4-a716-446655440000',
    );

    expect(envelopes).toHaveLength(1);
    expect(envelopes[0].session_ids).toHaveLength(1);
  });

  it('groups by Workspace and Pixel', () => {
    const envelopes = buildSessionRecomputeEnvelopes(
      [
        normalizedEvent(),
        normalizedEvent({
          workspace_id: '21000000-0000-0000-0000-000000000002',
          pixel_id: '31000000-0000-0000-0000-000000000002',
          session_id: '018bcfe5-6800-7000-8000-000000000004',
        }),
      ],
      '2026-08-31T18:00:02.000Z',
      () => crypto.randomUUID(),
    );

    expect(envelopes).toHaveLength(2);
  });

  it('chunks more than 100 sessions into bounded messages', () => {
    const events = Array.from({ length: 101 }, (_, index) =>
      normalizedEvent({
        event_id: `018bcfe5-6800-7000-8001-${String(index + 1).padStart(12, '0')}`,
        session_id: `018bcfe5-6800-7000-8002-${String(index + 1).padStart(12, '0')}`,
      }),
    );
    const envelopes = buildSessionRecomputeEnvelopes(
      events,
      '2026-08-31T18:00:02.000Z',
    );

    expect(envelopes.map((envelope) => envelope.session_ids.length)).toEqual([
      100, 1,
    ]);
  });
});
