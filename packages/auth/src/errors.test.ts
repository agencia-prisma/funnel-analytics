import { describe, expect, it } from 'vitest';

import { domainErrorMessage, extractDomainErrorCode } from './errors';

describe('domain errors', () => {
  it('extracts stable database domain codes', () => {
    expect(
      extractDomainErrorCode(new Error('P0001: LAST_OWNER_PROTECTION')),
    ).toBe('LAST_OWNER_PROTECTION');
    expect(extractDomainErrorCode(new Error('P0001: DOMAIN_DUPLICATE'))).toBe(
      'DOMAIN_DUPLICATE',
    );
    expect(extractDomainErrorCode(new Error('P0001: PIXEL_ARCHIVED'))).toBe(
      'PIXEL_ARCHIVED',
    );
  });

  it('does not expose raw technical errors', () => {
    expect(domainErrorMessage(new Error('socket exploded'))).toBe(
      'Não foi possível concluir a ação. Tente novamente.',
    );
  });
});
