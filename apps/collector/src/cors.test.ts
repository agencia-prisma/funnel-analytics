import { describe, expect, it } from 'vitest';

import { corsHeaders, parseOrigin } from './cors';

describe('CORS origin parsing', () => {
  it('accepts a valid browser Origin', () => {
    expect(parseOrigin('https://checkout.example.com')).toEqual({
      origin: 'https://checkout.example.com',
      host: 'checkout.example.com',
    });
  });

  it('rejects missing or malformed Origin', () => {
    expect(() => parseOrigin(null)).toThrow();
    expect(() => parseOrigin('not-an-origin')).toThrow();
    expect(() => parseOrigin('https://user:pass@example.com')).toThrow();
  });

  it('echoes Origin without credentials', () => {
    const headers = new Headers(corsHeaders('https://example.com'));

    expect(headers.get('Access-Control-Allow-Origin')).toBe(
      'https://example.com',
    );
    expect(headers.get('Vary')).toBe('Origin');
    expect(headers.has('Access-Control-Allow-Credentials')).toBe(false);
  });
});
