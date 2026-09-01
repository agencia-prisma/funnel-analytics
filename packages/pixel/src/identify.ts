import type {
  BrowserIdentifyIdentifiersV1,
  BrowserIdentifyRequestV1,
  ConsentStateV1,
} from '@funnel/event-contracts';

import { SDK_VERSION } from './config';
import type { EventIdentity } from './events';

const MAX_IDENTIFIER_LENGTHS: Record<
  keyof BrowserIdentifyIdentifiersV1,
  number
> = {
  email: 320,
  phone: 64,
  cpf: 32,
  name: 200,
};

export function validateBrowserIdentifyIdentifiers(
  input: BrowserIdentifyIdentifiersV1,
): BrowserIdentifyIdentifiersV1 | null {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return null;
  }

  const keys = Object.keys(input);

  if (
    keys.length === 0 ||
    keys.some((key) => !['email', 'phone', 'cpf', 'name'].includes(key))
  ) {
    return null;
  }

  const output: BrowserIdentifyIdentifiersV1 = {};

  for (const key of keys as Array<keyof BrowserIdentifyIdentifiersV1>) {
    const value = input[key];

    if (
      typeof value !== 'string' ||
      value.trim().length === 0 ||
      value.length > MAX_IDENTIFIER_LENGTHS[key]
    ) {
      return null;
    }

    output[key] = value;
  }

  return output;
}

export function createBrowserIdentifyRequest(input: {
  pixelKey: string;
  identity: EventIdentity;
  identifiers: BrowserIdentifyIdentifiersV1;
  consentState: ConsentStateV1;
  testMode: boolean;
  occurredAt?: string;
}): BrowserIdentifyRequestV1 {
  return {
    identify_version: 1,
    pixel_key: input.pixelKey,
    visitor_id: input.identity.visitorId,
    session_id: input.identity.sessionId,
    occurred_at: input.occurredAt ?? new Date().toISOString(),
    identifiers: input.identifiers,
    consent_state: input.consentState,
    sdk_version: SDK_VERSION,
    test_mode: input.testMode,
  };
}
