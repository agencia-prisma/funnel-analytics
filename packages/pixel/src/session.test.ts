import { describe, expect, it } from 'vitest';

import { getOrCreateSession } from './session';
import { MemoryStorageAdapter } from './storage';

describe('session lifecycle', () => {
  it('reuses the same session within 30 minutes', () => {
    const storage = new MemoryStorageAdapter();
    const first = getOrCreateSession(storage, 1_000);
    const second = getOrCreateSession(storage, 29 * 60 * 1000);

    expect(second.isNew).toBe(false);
    expect(second.state.session_id).toBe(first.state.session_id);
  });

  it('creates a new session after more than 30 minutes of inactivity', () => {
    const storage = new MemoryStorageAdapter();
    const first = getOrCreateSession(storage, 1_000);
    const second = getOrCreateSession(storage, 31 * 60 * 1000 + 1_000);

    expect(second.isNew).toBe(true);
    expect(second.state.session_id).not.toBe(first.state.session_id);
  });
});
