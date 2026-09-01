import { describe, expect, it } from 'vitest';

import {
  normalizeCpf,
  normalizeEmail,
  normalizeIdentifierSet,
  normalizeName,
  normalizePhone,
} from './index';

describe('identity normalization', () => {
  it('normalizes email without provider-specific rewriting', () => {
    expect(normalizeEmail('  USER@Example.COM ')).toBe('user@example.com');
    expect(normalizeEmail('user+tag@example.com')).toBe('user+tag@example.com');
  });

  it('normalizes deterministic E.164 phone input', () => {
    expect(normalizePhone('+55 (11) 99999-8888')).toBe('+5511999998888');
    expect(() => normalizePhone('11999998888')).toThrow(
      'IDENTITY_PHONE_INVALID',
    );
  });

  it('validates CPF checksum and removes punctuation', () => {
    expect(normalizeCpf('529.982.247-25')).toBe('52998224725');
    expect(() => normalizeCpf('111.111.111-11')).toThrow(
      'IDENTITY_CPF_INVALID',
    );
    expect(() => normalizeCpf('529.982.247-24')).toThrow(
      'IDENTITY_CPF_INVALID',
    );
  });

  it('normalizes name whitespace and unicode without making it strong', () => {
    expect(normalizeName('  José   da Silva  ')).toBe('José da Silva');

    const identifiers = normalizeIdentifierSet({
      name: '  José   da Silva  ',
      email: ' USER@EXAMPLE.COM ',
    });

    expect(identifiers).toEqual([
      { type: 'name', value: 'José da Silva', strong: false },
      { type: 'email', value: 'user@example.com', strong: true },
    ]);
  });
});
