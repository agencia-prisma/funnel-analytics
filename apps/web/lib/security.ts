import 'server-only';

import { createHash, randomBytes } from 'node:crypto';

export function createInviteToken() {
  const token = randomBytes(32).toString('base64url');

  return {
    token,
    tokenHash: hashInviteToken(token),
  };
}

export function hashInviteToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function createCollisionSuffix() {
  return randomBytes(3).toString('hex');
}

export function safeNextPath(value: FormDataEntryValue | string | null) {
  const path = typeof value === 'string' ? value : null;

  if (!path || !path.startsWith('/') || path.startsWith('//')) {
    return null;
  }

  return path;
}
