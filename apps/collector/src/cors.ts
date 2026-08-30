import { CollectorError } from './errors';

export interface ParsedOrigin {
  origin: string;
  host: string;
}

export function parseOrigin(value: string | null): ParsedOrigin {
  if (!value) {
    throw new CollectorError(403, 'ORIGIN_NOT_ALLOWED');
  }

  try {
    const url = new URL(value);

    if (
      (url.protocol !== 'https:' && url.protocol !== 'http:') ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    ) {
      throw new Error('invalid origin');
    }

    return {
      origin: url.origin,
      host: url.hostname.toLowerCase(),
    };
  } catch {
    throw new CollectorError(403, 'ORIGIN_NOT_ALLOWED');
  }
}

export function corsHeaders(origin: string): HeadersInit {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
}
