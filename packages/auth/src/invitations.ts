export type InvitationStatus = 'pending' | 'accepted' | 'expired' | 'revoked';

export function resolveInvitationStatus(
  status: InvitationStatus,
  expiresAt: string | Date,
  now: Date = new Date(),
): InvitationStatus {
  if (status !== 'pending') {
    return status;
  }

  return new Date(expiresAt).getTime() <= now.getTime() ? 'expired' : 'pending';
}
