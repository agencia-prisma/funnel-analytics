import { describe, expect, it } from 'vitest';

import { resolveInvitationStatus } from './invitations';

describe('invitation state', () => {
  const now = new Date('2026-08-29T23:00:00.000Z');

  it('marks an elapsed pending invitation as expired', () => {
    expect(
      resolveInvitationStatus('pending', '2026-08-29T22:59:59.000Z', now),
    ).toBe('expired');
  });

  it('keeps terminal states unchanged', () => {
    expect(
      resolveInvitationStatus('accepted', '2026-08-20T00:00:00.000Z', now),
    ).toBe('accepted');
    expect(
      resolveInvitationStatus('revoked', '2026-09-20T00:00:00.000Z', now),
    ).toBe('revoked');
  });
});
