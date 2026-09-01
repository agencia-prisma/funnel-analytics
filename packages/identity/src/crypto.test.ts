import { describe, expect, it } from 'vitest';

import {
  bytesToBase64Url,
  createBlindIndex,
  decryptIdentifier,
  encryptIdentifier,
  protectIdentifiers,
} from './index';

function key(fill: number) {
  return bytesToBase64Url(new Uint8Array(32).fill(fill));
}

describe('identity crypto', () => {
  const encryptionKey = key(7);
  const hmacKey = key(11);

  it('round-trips AES-GCM and uses a fresh IV', async () => {
    const first = await encryptIdentifier(
      'email',
      'user@example.com',
      encryptionKey,
      3,
    );
    const second = await encryptIdentifier(
      'email',
      'user@example.com',
      encryptionKey,
      3,
    );

    expect(first.encryption_key_version).toBe(3);
    expect(first.encrypted_value).not.toBe(second.encrypted_value);
    await expect(
      decryptIdentifier('email', first.encrypted_value, encryptionKey),
    ).resolves.toBe('user@example.com');
  });

  it('creates deterministic keyed blind indexes', async () => {
    const first = await createBlindIndex('email', 'user@example.com', hmacKey);
    const second = await createBlindIndex('email', 'user@example.com', hmacKey);
    const otherSecret = await createBlindIndex(
      'email',
      'user@example.com',
      key(12),
    );

    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(second).toBe(first);
    expect(otherSecret).not.toBe(first);
  });

  it('rejects tampered ciphertext', async () => {
    const encrypted = await encryptIdentifier(
      'cpf',
      '52998224725',
      encryptionKey,
    );
    const tampered =
      encrypted.encrypted_value.slice(0, -1) +
      (encrypted.encrypted_value.endsWith('A') ? 'B' : 'A');

    await expect(
      decryptIdentifier('cpf', tampered, encryptionKey),
    ).rejects.toMatchObject({ code: 'IDENTITY_DECRYPT_FAILED' });
  });

  it('protects identifiers without retaining plaintext', async () => {
    const protectedValues = await protectIdentifiers(
      [{ type: 'email', value: 'user@example.com', strong: true }],
      { encryptionKey, hmacKey, encryptionKeyVersion: 2 },
    );

    expect(protectedValues).toHaveLength(1);
    expect(protectedValues[0]?.blind_index).toMatch(/^[0-9a-f]{64}$/);
    expect(protectedValues[0]?.encrypted_value).not.toContain(
      'user@example.com',
    );
    expect(protectedValues[0]?.encryption_key_version).toBe(2);
  });
});
