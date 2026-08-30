import { describe, expect, it } from 'vitest';

import { decorateLink, readLinkerToken } from './cross-domain';

describe('cross-domain preparation', () => {
  it('decorates links only with an opaque linker token', () => {
    const decorated = decorateLink(
      'https://checkout.example.com/',
      'signed-token-value',
    );

    expect(decorated).toContain('_fa_linker=signed-token-value');
    expect(readLinkerToken(decorated)).toBe('signed-token-value');
  });

  it('refuses a raw visitor UUID as linker token', () => {
    const visitorId = '018bcfe5-6800-7000-8000-000000000001';

    expect(decorateLink('https://checkout.example.com/', visitorId)).toBe(
      'https://checkout.example.com/',
    );
  });
});
