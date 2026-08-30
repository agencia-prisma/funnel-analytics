import { describe, expect, it } from 'vitest';

import {
  domainMatchesAuthorizedPattern,
  isValidDomain,
  normalizeDomain,
} from './domains';

describe('domain configuration', () => {
  it('normalizes protocol, path, query and fragment', () => {
    expect(normalizeDomain('https://Example.com/path?utm=1#section')).toEqual({
      domain: 'example.com',
      wildcard: false,
    });
  });

  it('normalizes wildcard domains without storing the wildcard marker', () => {
    expect(normalizeDomain('*.Example.com')).toEqual({
      domain: 'example.com',
      wildcard: true,
    });
  });

  it('rejects obviously invalid domains', () => {
    expect(normalizeDomain('not a domain')).toBeNull();
    expect(normalizeDomain('localhost')).toBeNull();
    expect(normalizeDomain('https://example.com:8080')).toBeNull();
    expect(isValidDomain('https://example.com')).toBe(false);
  });

  it('matches wildcard subdomains without matching lookalike domains', () => {
    const pattern = { domain: 'example.com', wildcard: true };

    expect(
      domainMatchesAuthorizedPattern('checkout.example.com', pattern),
    ).toBe(true);
    expect(domainMatchesAuthorizedPattern('www.example.com', pattern)).toBe(
      true,
    );
    expect(domainMatchesAuthorizedPattern('example.com', pattern)).toBe(false);
    expect(domainMatchesAuthorizedPattern('fakeexample.com', pattern)).toBe(
      false,
    );
  });
});
