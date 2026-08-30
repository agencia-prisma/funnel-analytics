const SENSITIVE_QUERY_KEYS = new Set([
  'email',
  'e-mail',
  'phone',
  'telephone',
  'tel',
  'cpf',
  'document',
  'password',
  'pass',
  'token',
  'access_token',
  'refresh_token',
  'authorization',
  'card',
  'credit_card',
  'cvv',
]);

const EMAIL_PATTERN = /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/i;

export interface PageContext {
  pageUrl: string;
  pagePath: string;
  pageTitle: string;
  referrer: string | null;
  referrerDomain: string | null;
  language: string | null;
  timezone: string | null;
  screen: {
    width: number;
    height: number;
    devicePixelRatio: number;
  };
  viewport: {
    width: number;
    height: number;
  };
}

function safeText(value: string, maxLength: number): string {
  const trimmed = value.trim().slice(0, maxLength);

  if (EMAIL_PATTERN.test(trimmed)) {
    return '[redacted]';
  }

  return trimmed;
}

export function sanitizeUrl(value: string): string {
  try {
    const url = new URL(value, window.location.href);

    for (const key of Array.from(url.searchParams.keys())) {
      if (SENSITIVE_QUERY_KEYS.has(key.toLowerCase())) {
        url.searchParams.delete(key);
      }
    }

    url.hash = '';
    return url.href.slice(0, 2_048);
  } catch {
    return '';
  }
}

export function getReferrerDomain(
  referrer: string | null,
  currentHostname: string,
): string | null {
  if (!referrer) {
    return null;
  }

  try {
    const hostname = new URL(referrer).hostname.toLowerCase();

    if (!hostname || hostname === currentHostname.toLowerCase()) {
      return null;
    }

    return hostname;
  } catch {
    return null;
  }
}

export function collectPageContext(
  windowRef: Window,
  documentRef: Document,
): PageContext {
  const pageUrl = sanitizeUrl(windowRef.location.href);
  const rawReferrer = documentRef.referrer
    ? sanitizeUrl(documentRef.referrer)
    : null;

  let timezone: string | null = null;

  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    timezone = null;
  }

  return {
    pageUrl,
    pagePath: windowRef.location.pathname.slice(0, 1_024),
    pageTitle: safeText(documentRef.title, 256),
    referrer: rawReferrer || null,
    referrerDomain: getReferrerDomain(
      rawReferrer,
      windowRef.location.hostname,
    ),
    language: windowRef.navigator.language || null,
    timezone,
    screen: {
      width: Math.max(0, Math.round(windowRef.screen?.width ?? 0)),
      height: Math.max(0, Math.round(windowRef.screen?.height ?? 0)),
      devicePixelRatio: Number.isFinite(windowRef.devicePixelRatio)
        ? windowRef.devicePixelRatio
        : 1,
    },
    viewport: {
      width: Math.max(0, Math.round(windowRef.innerWidth ?? 0)),
      height: Math.max(0, Math.round(windowRef.innerHeight ?? 0)),
    },
  };
}
