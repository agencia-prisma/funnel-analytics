export const LINKER_QUERY_PARAMETER = '_fa_linker';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function browserBaseUrl(): string {
  return typeof window === 'undefined'
    ? 'https://invalid.local/'
    : window.location.href;
}

export function decorateLink(urlValue: string, linkerToken: string): string {
  if (
    !linkerToken ||
    linkerToken.length > 1_024 ||
    UUID_PATTERN.test(linkerToken)
  ) {
    return urlValue;
  }

  try {
    const url = new URL(urlValue, browserBaseUrl());
    url.searchParams.set(LINKER_QUERY_PARAMETER, linkerToken);

    return url.href;
  } catch {
    return urlValue;
  }
}

export function readLinkerToken(urlValue = browserBaseUrl()): string | null {
  try {
    const value = new URL(urlValue, browserBaseUrl()).searchParams.get(
      LINKER_QUERY_PARAMETER,
    );

    if (!value || value.length > 1_024 || UUID_PATTERN.test(value)) {
      return null;
    }

    return value;
  } catch {
    return null;
  }
}
