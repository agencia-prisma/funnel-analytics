import { IdentityError } from './errors';

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded =
    normalized + '='.repeat((4 - (normalized.length % 4)) % 4);

  try {
    const binary = atob(padded);
    return Uint8Array.from(binary, (character) =>
      character.charCodeAt(0),
    );
  } catch {
    throw new IdentityError('IDENTITY_CRYPTO_KEY_INVALID');
  }
}

export function decodeSecretKey(
  value: string,
  minimumBytes = 32,
): Uint8Array {
  const bytes = base64UrlToBytes(value.trim());

  if (bytes.byteLength < minimumBytes) {
    throw new IdentityError('IDENTITY_CRYPTO_KEY_INVALID');
  }

  return bytes;
}
