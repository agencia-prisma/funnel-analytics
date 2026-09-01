import type {
  IdentityIdentifierTypeV1,
  ProtectedIdentifierV1,
} from '@funnel/event-contracts';

import {
  base64UrlToBytes,
  bytesToBase64Url,
  decodeSecretKey,
} from './encoding';
import { IdentityError } from './errors';
import type { NormalizedIdentifier } from './normalization';

export interface IdentityCryptoKeys {
  encryptionKey: string;
  hmacKey: string;
  encryptionKeyVersion?: number;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

async function importAesKey(secret: string): Promise<CryptoKey> {
  const bytes = decodeSecretKey(secret, 32);

  if (bytes.byteLength !== 32) {
    throw new IdentityError('IDENTITY_CRYPTO_KEY_INVALID');
  }

  return crypto.subtle.importKey(
    'raw',
    toArrayBuffer(bytes),
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    toArrayBuffer(decodeSecretKey(secret, 32)),
    {
      name: 'HMAC',
      hash: 'SHA-256',
    },
    false,
    ['sign'],
  );
}

function associatedData(type: IdentityIdentifierTypeV1): Uint8Array {
  return encoder.encode(`funnel-identity:${type}:v1`);
}

export async function createBlindIndex(
  type: IdentityIdentifierTypeV1,
  normalizedValue: string,
  hmacSecret: string,
): Promise<string> {
  const key = await importHmacKey(hmacSecret);
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    toArrayBuffer(encoder.encode(`${type}:${normalizedValue}`)),
  );

  return Array.from(new Uint8Array(signature), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

export async function encryptIdentifier(
  type: IdentityIdentifierTypeV1,
  normalizedValue: string,
  encryptionSecret: string,
  keyVersion = 1,
): Promise<
  Pick<
    ProtectedIdentifierV1,
    'encrypted_value' | 'encryption_key_version'
  >
> {
  const key = await importAesKey(encryptionSecret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: toArrayBuffer(iv),
      additionalData: toArrayBuffer(associatedData(type)),
      tagLength: 128,
    },
    key,
    toArrayBuffer(encoder.encode(normalizedValue)),
  );

  return {
    encrypted_value: `aes256gcm.${bytesToBase64Url(
      iv,
    )}.${bytesToBase64Url(new Uint8Array(ciphertext))}`,
    encryption_key_version: keyVersion,
  };
}

export async function decryptIdentifier(
  type: IdentityIdentifierTypeV1,
  encryptedValue: string,
  encryptionSecret: string,
): Promise<string> {
  const [algorithm, ivPart, ciphertextPart] =
    encryptedValue.split('.');

  if (
    algorithm !== 'aes256gcm' ||
    !ivPart ||
    !ciphertextPart
  ) {
    throw new IdentityError('IDENTITY_DECRYPT_FAILED');
  }

  try {
    const key = await importAesKey(encryptionSecret);
    const plaintext = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: toArrayBuffer(base64UrlToBytes(ivPart)),
        additionalData: toArrayBuffer(associatedData(type)),
        tagLength: 128,
      },
      key,
      toArrayBuffer(base64UrlToBytes(ciphertextPart)),
    );

    return decoder.decode(plaintext);
  } catch {
    throw new IdentityError('IDENTITY_DECRYPT_FAILED');
  }
}

export async function protectIdentifiers(
  identifiers: NormalizedIdentifier[],
  keys: IdentityCryptoKeys,
): Promise<ProtectedIdentifierV1[]> {
  const version = keys.encryptionKeyVersion ?? 1;

  if (!Number.isInteger(version) || version < 1) {
    throw new IdentityError('IDENTITY_CRYPTO_KEY_INVALID');
  }

  return Promise.all(
    identifiers.map(async (identifier) => ({
      type: identifier.type,
      blind_index: await createBlindIndex(
        identifier.type,
        identifier.value,
        keys.hmacKey,
      ),
      ...(await encryptIdentifier(
        identifier.type,
        identifier.value,
        keys.encryptionKey,
        version,
      )),
    })),
  );
}
