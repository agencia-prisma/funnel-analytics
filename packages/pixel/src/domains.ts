export interface NormalizedDomain {
  domain: string;
  wildcard: boolean;
}

const DOMAIN_PATTERN =
  /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])$/;

export function isValidDomain(value: string): boolean {
  if (value.length < 3 || value.length > 253) {
    return false;
  }

  if (
    value !== value.toLowerCase() ||
    value.includes('/') ||
    value.includes(':') ||
    value.includes('?') ||
    value.includes('#') ||
    value.includes('@') ||
    value.includes('*')
  ) {
    return false;
  }

  return DOMAIN_PATTERN.test(value);
}

export function normalizeDomain(value: string): NormalizedDomain | null {
  let candidate = value.trim().toLowerCase();
  let wildcard = false;

  if (!candidate) {
    return null;
  }

  if (candidate.startsWith('*.')) {
    wildcard = true;
    candidate = candidate.slice(2);
  } else {
    const schemeWildcard = candidate.match(
      /^([a-z][a-z0-9+.-]*:\/\/)\*\.(.+)$/i,
    );

    if (schemeWildcard) {
      wildcard = true;
      candidate = `${schemeWildcard[1]}${schemeWildcard[2]}`;
    }
  }

  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(candidate)
    ? candidate
    : `https://${candidate}`;

  try {
    const url = new URL(withScheme);

    if (url.username || url.password || url.port) {
      return null;
    }

    const domain = url.hostname.replace(/\.$/, '');

    if (!isValidDomain(domain)) {
      return null;
    }

    return { domain, wildcard };
  } catch {
    return null;
  }
}

export function domainMatchesAuthorizedPattern(
  candidate: string,
  authorized: NormalizedDomain,
): boolean {
  const normalizedCandidate = normalizeDomain(candidate);

  if (!normalizedCandidate) {
    return false;
  }

  if (!authorized.wildcard) {
    return normalizedCandidate.domain === authorized.domain;
  }

  return (
    normalizedCandidate.domain !== authorized.domain &&
    normalizedCandidate.domain.endsWith(`.${authorized.domain}`)
  );
}
