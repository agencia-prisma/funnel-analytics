import { describe, expect, it } from 'vitest';

import { captureTouch, resolveAttribution } from './attribution';
import { MemoryStorageAdapter } from './storage';

describe('attribution', () => {
  it('captures UTMs and documented click ids', () => {
    const touch = captureTouch(
      'https://example.com/?utm_source=meta&utm_medium=paid&utm_campaign=launch&utm_content=hero&utm_term=shoes&fbclid=abc&ttclid=def&gclid=ghi',
      'https://instagram.com/post',
      'example.com',
      '2026-08-30T00:00:00.000Z',
    );

    expect(touch).toMatchObject({
      source: 'meta',
      medium: 'paid',
      campaign: 'launch',
      utm_source: 'meta',
      utm_campaign: 'launch',
      click_ids: {
        fbclid: 'abc',
        ttclid: 'def',
        gclid: 'ghi',
      },
    });
  });

  it('keeps first touch and session touch through internal navigation', () => {
    const storage = new MemoryStorageAdapter();
    const landing = captureTouch(
      'https://example.com/?utm_source=meta&utm_campaign=abc&fbclid=123',
      'https://facebook.com/',
      'example.com',
    );

    const first = resolveAttribution(storage, 'session-a', true, landing);

    const checkout = captureTouch(
      'https://example.com/checkout',
      'https://example.com/',
      'example.com',
    );
    const second = resolveAttribution(
      storage,
      'session-a',
      false,
      checkout,
    );

    expect(second.firstTouch).toEqual(first.firstTouch);
    expect(second.sessionTouch.utm_source).toBe('meta');
    expect(second.sessionTouch.utm_campaign).toBe('abc');
    expect(second.sessionTouch.click_ids.fbclid).toBe('123');
  });

  it('creates a new direct session touch without overwriting first touch', () => {
    const storage = new MemoryStorageAdapter();
    const paid = captureTouch(
      'https://example.com/?utm_source=meta',
      null,
      'example.com',
    );
    resolveAttribution(storage, 'session-a', true, paid);

    const direct = captureTouch(
      'https://example.com/return',
      null,
      'example.com',
    );
    const next = resolveAttribution(storage, 'session-b', true, direct);

    expect(next.firstTouch.utm_source).toBe('meta');
    expect(next.sessionTouch.source).toBe('direct');
    expect(next.sessionTouch.medium).toBe('none');
  });
});
