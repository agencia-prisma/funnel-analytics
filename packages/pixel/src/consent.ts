import type { ConsentStateV1 } from '@funnel/event-contracts';

import {
  readJson,
  STORAGE_KEYS,
  type StorageAdapter,
  writeJson,
} from './storage';

export interface ConsentSettings {
  analytics?: boolean;
  identification?: boolean;
}

export class ConsentManager {
  private settings: ConsentSettings;

  constructor(
    private readonly storage: StorageAdapter,
    private readonly requireConsent: boolean,
  ) {
    this.settings =
      readJson<ConsentSettings>(storage, STORAGE_KEYS.consent) ?? {};
  }

  getState(): ConsentStateV1 {
    if (this.settings.analytics === false) {
      return 'denied';
    }

    if (this.settings.analytics === true) {
      return 'granted';
    }

    return 'unknown';
  }

  canTrack(): boolean {
    if (this.settings.analytics === false) {
      return false;
    }

    return !this.requireConsent || this.settings.analytics === true;
  }

  canPersistIdentity(): boolean {
    return this.canTrack() && this.settings.identification !== false;
  }

  update(next: ConsentSettings): ConsentStateV1 {
    this.settings = {
      ...this.settings,
      ...next,
    };
    writeJson(this.storage, STORAGE_KEYS.consent, this.settings);

    return this.getState();
  }

  snapshot(): ConsentSettings {
    return { ...this.settings };
  }
}
