import { describe, expect, it } from 'vitest';

import { getOrCreateVisitorId, isUuidV7 } from './ids';
import { MemoryStorageAdapter } from './storage';

describe('visitor identity', () => {
  it('creates, persists and reuses a visitor id', () => {
    const storage = new MemoryStorageAdapter();

    const first = getOrCreateVisitorId(storage, 1_700_000_000_000);
    const second = getOrCreateVisitorId(storage, 1_700_000_100_000);

    expect(isUuidV7(first)).toBe(true);
    expect(second).toBe(first);
  });
});
