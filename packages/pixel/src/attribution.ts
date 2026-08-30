import { sanitizeUrl } from './context';
import {
  readJson,
  STORAGE_KEYS,
  type StorageAdapter,
  writeJson,
} from './storage';

export const CLICK_ID_KEYS = [
  'fbclid',
  'ttclid',
  'gclid',
  'msclkid',
  'tblci',
] as const;

export interface TouchContext {
  timestamp: string;
  source: string;
  medium: string;
  campaign: string | null;
  landing_url: string;
  referrer: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  click_ids: Record<string, string>;
}

interface StoredSessionTouch {
  session_id: string;
  touch: TouchContext;
}

function boundedParameter(
  params: URLSearchParams,
  key: string,
): string | null {
  const value = params.get(key)?.trim();

  return value ? value.slice(0, 512) : null;
}

export function captureTouch(
  pageUrl: string,
  referrer: string | null,
  currentHostname: string,
  occurredAt = new Date().toISOString(),
): TouchContext {
  let url: URL;

  try {
    url = new URL(pageUrl);
  } catch {
    url = new URL('https://invalid.local/');
  }

  const clickIds: Record<string, string> = {};

  for (const key of CLICK_ID_KEYS) {
    const value = boundedParameter(url.searchParams, key);

    if (value) {
      clickIds[key] = value;
    }
  }

  const utmSource = boundedParameter(url.searchParams, 'utm_source');
  const utmMedium = boundedParameter(url.searchParams, 'utm_medium');
  const utmCampaign = boundedParameter(url.searchParams, 'utm_campaign');
  const utmContent = boundedParameter(url.searchParams, 'utm_content');
  const utmTerm = boundedParameter(url.searchParams, 'utm_term');

  let externalReferrer: string | null = null;
  let externalReferrerDomain: string | null = null;

  if (referrer) {
    try {
      const referrerUrl = new URL(referrer);

      if (
        referrerUrl.hostname.toLowerCase() !== currentHostname.toLowerCase()
      ) {
        externalReferrer = sanitizeUrl(referrer);
        externalReferrerDomain = referrerUrl.hostname.toLowerCase();
      }
    } catch {
      externalReferrer = null;
    }
  }

  return {
    timestamp: occurredAt,
    source: utmSource ?? externalReferrerDomain ?? 'direct',
    medium: utmMedium ?? (externalReferrerDomain ? 'referral' : 'none'),
    campaign: utmCampaign,
    landing_url: sanitizeUrl(pageUrl),
    referrer: externalReferrer,
    utm_source: utmSource,
    utm_medium: utmMedium,
    utm_campaign: utmCampaign,
    utm_content: utmContent,
    utm_term: utmTerm,
    click_ids: clickIds,
  };
}

export function resolveAttribution(
  storage: StorageAdapter | null,
  sessionId: string,
  isNewSession: boolean,
  currentTouch: TouchContext,
): {
  firstTouch: TouchContext;
  sessionTouch: TouchContext;
} {
  if (!storage) {
    return {
      firstTouch: currentTouch,
      sessionTouch: currentTouch,
    };
  }

  let firstTouch = readJson<TouchContext>(storage, STORAGE_KEYS.firstTouch);

  if (!firstTouch) {
    firstTouch = currentTouch;
    writeJson(storage, STORAGE_KEYS.firstTouch, firstTouch);
  }

  const storedSessionTouch = readJson<StoredSessionTouch>(
    storage,
    STORAGE_KEYS.sessionTouch,
  );

  let sessionTouch = storedSessionTouch?.touch ?? currentTouch;

  if (
    isNewSession ||
    !storedSessionTouch ||
    storedSessionTouch.session_id !== sessionId
  ) {
    sessionTouch = currentTouch;
    writeJson(storage, STORAGE_KEYS.sessionTouch, {
      session_id: sessionId,
      touch: sessionTouch,
    } satisfies StoredSessionTouch);
  }

  return { firstTouch, sessionTouch };
}
