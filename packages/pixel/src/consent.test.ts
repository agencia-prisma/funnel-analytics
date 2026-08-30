import { describe, expect, it } from 'vitest';

import { ConsentManager } from './consent';
import { MemoryStorageAdapter } from './storage';

describe('consent mode', () => {
  it('supports unknown, granted, denied and state changes', () => {
    const storage = new MemoryStorageAdapter();
    const consent = new ConsentManager(storage, true);

    expect(consent.getState()).toBe('unknown');
    expect(consent.canTrack()).toBe(false);

    expect(consent.update({ analytics: true })).toBe('granted');
    expect(consent.canTrack()).toBe(true);

    expect(consent.update({ analytics: true, identification: false })).toBe(
      'granted',
    );
    expect(consent.canPersistIdentity()).toBe(false);

    expect(consent.update({ analytics: false })).toBe('denied');
    expect(consent.canTrack()).toBe(false);
  });

  it('can track unknown consent when the client does not require consent', () => {
    const consent = new ConsentManager(new MemoryStorageAdapter(), false);

    expect(consent.getState()).toBe('unknown');
    expect(consent.canTrack()).toBe(true);
  });
});
