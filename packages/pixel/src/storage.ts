import { DEFAULT_VISITOR_MAX_AGE_DAYS } from './config';

export const STORAGE_KEYS = {
  visitor: '_fa_vid',
  session: '_fa_session',
  firstTouch: '_fa_first_touch',
  sessionTouch: '_fa_session_touch',
  consent: '_fa_consent',
  queue: '_fa_queue',
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];

export interface StorageAdapter {
  get(key: StorageKey): string | null;
  set(key: StorageKey, value: string): void;
  remove(key: StorageKey): void;
}

function readCookie(documentRef: Document, key: string): string | null {
  const prefix = `${encodeURIComponent(key)}=`;

  for (const part of documentRef.cookie.split(';')) {
    const candidate = part.trim();

    if (candidate.startsWith(prefix)) {
      return decodeURIComponent(candidate.slice(prefix.length));
    }
  }

  return null;
}

export class BrowserStorageAdapter implements StorageAdapter {
  constructor(
    private readonly windowRef: Window,
    private readonly documentRef: Document,
    private readonly visitorMaxAgeDays = DEFAULT_VISITOR_MAX_AGE_DAYS,
  ) {}

  get(key: StorageKey): string | null {
    if (key === STORAGE_KEYS.visitor) {
      const cookieValue = readCookie(this.documentRef, key);

      if (cookieValue) {
        return cookieValue;
      }
    }

    try {
      return this.windowRef.localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  set(key: StorageKey, value: string): void {
    if (key === STORAGE_KEYS.visitor) {
      const secure =
        this.windowRef.location.protocol === 'https:' ? '; Secure' : '';
      const maxAge = this.visitorMaxAgeDays * 24 * 60 * 60;

      this.documentRef.cookie = `${encodeURIComponent(key)}=${encodeURIComponent(value)}; Path=/; SameSite=Lax; Max-Age=${maxAge}${secure}`;
    }

    try {
      this.windowRef.localStorage.setItem(key, value);
    } catch {
      // Storage can be unavailable in privacy modes. The SDK must remain safe.
    }
  }

  remove(key: StorageKey): void {
    if (key === STORAGE_KEYS.visitor) {
      this.documentRef.cookie = `${encodeURIComponent(key)}=; Path=/; SameSite=Lax; Max-Age=0`;
    }

    try {
      this.windowRef.localStorage.removeItem(key);
    } catch {
      // Ignore storage failures.
    }
  }
}

export class MemoryStorageAdapter implements StorageAdapter {
  private readonly values = new Map<StorageKey, string>();

  get(key: StorageKey): string | null {
    return this.values.get(key) ?? null;
  }

  set(key: StorageKey, value: string): void {
    this.values.set(key, value);
  }

  remove(key: StorageKey): void {
    this.values.delete(key);
  }
}

export function readJson<T>(
  storage: StorageAdapter,
  key: StorageKey,
): T | null {
  const value = storage.get(key);

  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    storage.remove(key);
    return null;
  }
}

export function writeJson(
  storage: StorageAdapter,
  key: StorageKey,
  value: unknown,
): void {
  storage.set(key, JSON.stringify(value));
}

export function clearTrackingStorage(storage: StorageAdapter): void {
  storage.remove(STORAGE_KEYS.visitor);
  storage.remove(STORAGE_KEYS.session);
  storage.remove(STORAGE_KEYS.firstTouch);
  storage.remove(STORAGE_KEYS.sessionTouch);
  storage.remove(STORAGE_KEYS.queue);
}
