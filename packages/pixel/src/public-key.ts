const PIXEL_PUBLIC_KEY_PREFIX = 'px_pub_';

function randomHex(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);

  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  );
}

export function generatePixelPublicKey(): string {
  return `${PIXEL_PUBLIC_KEY_PREFIX}${randomHex(18)}`;
}

export function isPixelPublicKey(value: string): boolean {
  return /^px_pub_[0-9a-f]{36}$/.test(value);
}
