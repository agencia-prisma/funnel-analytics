import { randomBytes } from 'node:crypto';

const PIXEL_PUBLIC_KEY_PREFIX = 'px_pub_';

export function generatePixelPublicKey(): string {
  return `${PIXEL_PUBLIC_KEY_PREFIX}${randomBytes(18).toString('hex')}`;
}

export function isPixelPublicKey(value: string): boolean {
  return /^px_pub_[0-9a-f]{36}$/.test(value);
}
