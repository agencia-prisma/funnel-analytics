import { describe, expect, it } from 'vitest';

import { snapshotFromAggregate } from './snapshot';
import { aggregateRow } from './test-fixtures';

describe('session snapshot calculation', () => {
  it('calculates duration, counts, landing and exit from canonical aggregate', () => {
    const snapshot = snapshotFromAggregate(aggregateRow());

    expect(snapshot.duration_seconds).toBe(600);
    expect(snapshot.event_count).toBe(3);
    expect(snapshot.page_view_count).toBe(2);
    expect(snapshot.custom_event_count).toBe(1);
    expect(snapshot.landing_page_path).toBe('/');
    expect(snapshot.exit_page_path).toBe('/checkout');
  });

  it('supports a custom-event-only session with nullable landing and exit', () => {
    const snapshot = snapshotFromAggregate(
      aggregateRow({
        event_count: 1,
        page_view_count: 0,
        custom_event_count: 1,
        landing_page_url: '',
        landing_page_path: '',
        landing_page_title: '',
        exit_page_url: '',
        exit_page_path: '',
        exit_page_title: '',
        last_activity_at_ms: 1_788_199_200_000,
      }),
    );

    expect(snapshot.duration_seconds).toBe(0);
    expect(snapshot.landing_page_url).toBeNull();
    expect(snapshot.exit_page_url).toBeNull();
  });

  it('rejects a session shared by multiple visitors', () => {
    expect(() =>
      snapshotFromAggregate(aggregateRow({ visitor_count: 2 })),
    ).toThrowError(
      expect.objectContaining({
        code: 'SESSION_INTEGRITY_VIOLATION',
      }),
    );
  });

  it('rejects mixed test/prod state inside one session', () => {
    expect(() =>
      snapshotFromAggregate(aggregateRow({ test_mode_count: 2 })),
    ).toThrowError(
      expect.objectContaining({
        code: 'SESSION_INTEGRITY_VIOLATION',
      }),
    );
  });
});
