import { DEFAULT_SESSION_TIMEOUT_MS } from './config';
import { createUuidV7 } from './ids';
import {
  readJson,
  STORAGE_KEYS,
  type StorageAdapter,
  writeJson,
} from './storage';

export interface SessionState {
  session_id: string;
  session_started_at: number;
  last_activity_at: number;
}

export interface SessionResult {
  state: SessionState;
  isNew: boolean;
}

export function getOrCreateSession(
  storage: StorageAdapter | null,
  now = Date.now(),
  timeoutMs = DEFAULT_SESSION_TIMEOUT_MS,
): SessionResult {
  const existing = storage
    ? readJson<SessionState>(storage, STORAGE_KEYS.session)
    : null;

  if (
    existing &&
    now >= existing.last_activity_at &&
    now - existing.last_activity_at <= timeoutMs
  ) {
    const state = {
      ...existing,
      last_activity_at: now,
    };

    if (storage) {
      writeJson(storage, STORAGE_KEYS.session, state);
    }

    return { state, isNew: false };
  }

  const state: SessionState = {
    session_id: createUuidV7(now),
    session_started_at: now,
    last_activity_at: now,
  };

  if (storage) {
    writeJson(storage, STORAGE_KEYS.session, state);
  }

  return { state, isNew: true };
}

export function touchSession(
  storage: StorageAdapter | null,
  state: SessionState,
  now = Date.now(),
  minWriteIntervalMs = 60_000,
): SessionState {
  if (now - state.last_activity_at < minWriteIntervalMs) {
    return state;
  }

  const next = {
    ...state,
    last_activity_at: now,
  };

  if (storage) {
    writeJson(storage, STORAGE_KEYS.session, next);
  }

  return next;
}
