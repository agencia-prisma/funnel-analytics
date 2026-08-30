import { STORAGE_KEYS, type StorageAdapter } from './storage';

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  );
}

export function createUuidV7(now = Date.now()): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  let timestamp = now;
  for (let index = 5; index >= 0; index -= 1) {
    bytes[index] = timestamp & 0xff;
    timestamp = Math.floor(timestamp / 256);
  }

  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const value = hex(bytes);

  return [
    value.slice(0, 8),
    value.slice(8, 12),
    value.slice(12, 16),
    value.slice(16, 20),
    value.slice(20),
  ].join('-');
}

export function isUuidV7(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export function getOrCreateVisitorId(
  storage: StorageAdapter | null,
  now = Date.now(),
): string {
  const existing = storage?.get(STORAGE_KEYS.visitor);

  if (existing && isUuidV7(existing)) {
    return existing;
  }

  const visitorId = createUuidV7(now);
  storage?.set(STORAGE_KEYS.visitor, visitorId);

  return visitorId;
}
