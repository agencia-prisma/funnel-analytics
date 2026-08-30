import { corsHeaders } from './cors';
import type { CollectorError } from './errors';

function baseHeaders(requestId: string): Headers {
  return new Headers({
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'X-Request-Id': requestId,
  });
}

export function jsonResponse(
  body: unknown,
  status: number,
  requestId: string,
  origin?: string,
  additional?: HeadersInit,
): Response {
  const headers = baseHeaders(requestId);

  if (origin) {
    for (const [key, value] of Object.entries(corsHeaders(origin))) {
      headers.set(key, String(value));
    }
  }

  if (additional) {
    new Headers(additional).forEach((value, key) => headers.set(key, value));
  }

  return new Response(JSON.stringify(body), { status, headers });
}

export function errorResponse(
  error: CollectorError,
  requestId: string,
  origin?: string,
): Response {
  const additional: HeadersInit = {};

  if (error.retryAfterSeconds) {
    additional['Retry-After'] = String(error.retryAfterSeconds);
  }

  return jsonResponse(
    {
      accepted: false,
      error: {
        code: error.code,
      },
      request_id: requestId,
    },
    error.status,
    requestId,
    origin,
    additional,
  );
}

export function acceptedResponse(
  eventCount: number,
  requestId: string,
  origin: string,
): Response {
  return jsonResponse(
    {
      accepted: true,
      event_count: eventCount,
      request_id: requestId,
    },
    202,
    requestId,
    origin,
  );
}
