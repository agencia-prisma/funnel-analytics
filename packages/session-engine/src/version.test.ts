import { describe, expect, it } from 'vitest';

import {
  createSessionVersion,
  sessionPartitionMonthFromUuidV7,
} from './version';

describe('session snapshot version', () => {
  it('is deterministic for identical canonical event sets', () => {
    expect(createSessionVersion(1_788_199_801_000, 3)).toBe(
      createSessionVersion(1_788_199_801_000, 3),
    );
  });

  it('changes for a late event received later', () => {
    expect(
      BigInt(createSessionVersion(1_788_199_802_000, 4)),
    ).toBeGreaterThan(BigInt(createSessionVersion(1_788_199_801_000, 3)));
  });

  it('derives a stable monthly partition from UUIDv7 identity', () => {
    expect(
      sessionPartitionMonthFromUuidV7(
        '018bcfe5-6800-7000-8000-000000000003',
      ),
    ).toBe(202311);
  });
});
