import { describe, expect, it } from 'vitest';

import { domainErrorMessage, extractDomainErrorCode } from './errors';

describe('domain errors', () => {
  it('extracts a stable domain code from database errors', () => {
    expect(
      extractDomainErrorCode(new Error('P0001: LAST_OWNER_PROTECTION')),
    ).toBe('LAST_OWNER_PROTECTION');
  });

  it('does not expose raw technical errors', () => {
    expect(domainErrorMessage(new Error('socket exploded'))).toBe(
      'Não foi possível concluir a ação. Tente novamente.',
    );
  });
});
