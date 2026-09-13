import { parseOrigin, corsHeaders } from './cors';
import { COLLECTOR_VERSION, createCollector } from './collector';
import { CollectorError } from './errors';
import { createIdentityCollector } from './identify';
import { CloudflareIdentityQueueProducer } from './identity-queue';
import { LocalPixelRegistry, type PixelRegistry } from './pixel-registry';
import { SupabasePixelRegistry } from './pixel-registry-supabase';
import { CloudflareQueueProducer } from './queue';
import { CloudflareRateLimiter } from './rate-limit';
import { errorResponse, jsonResponse } from './responses';
import {
  PIXEL_SCRIPT,
  PIXEL_SCRIPT_ETAG,
  PIXEL_SCRIPT_VERSION,
} from './pixel-script.generated';
import type { CollectorEnv, ExecutionContextLike } from './types';

const VERSIONED_PIXEL_PATH = `/pixel.v${PIXEL_SCRIPT_VERSION}.js`;

function pixelScriptResponse(request: Request, pathname: string): Response {
  const headers = new Headers({
    'Cache-Control':
      pathname === VERSIONED_PIXEL_PATH
        ? 'public, max-age=31536000, immutable'
        : 'public, max-age=300, stale-while-revalidate=86400',
    'Content-Type': 'application/javascript; charset=utf-8',
    'Cross-Origin-Resource-Policy': 'cross-origin',
    ETag: PIXEL_SCRIPT_ETAG,
    'X-Content-Type-Options': 'nosniff',
    'X-Pixel-SDK-Version': PIXEL_SCRIPT_VERSION,
  });

  if (request.headers.get('if-none-match') === PIXEL_SCRIPT_ETAG) {
    return new Response(null, { status: 304, headers });
  }

  return new Response(request.method === 'HEAD' ? null : PIXEL_SCRIPT, {
    status: 200,
    headers,
  });
}

function registryForEnv(env: CollectorEnv): PixelRegistry {
  if (env.COLLECTOR_ENV === 'local' && env.LOCAL_PIXEL_REGISTRY_JSON) {
    return new LocalPixelRegistry(env.LOCAL_PIXEL_REGISTRY_JSON);
  }

  return new SupabasePixelRegistry(
    env.SUPABASE_URL ?? '',
    env.SUPABASE_SECRET_KEY ?? '',
  );
}

export function createRouter(env: CollectorEnv) {
  const registry = registryForEnv(env);
  const collector = createCollector({
    registry,
    queue: new CloudflareQueueProducer(env.EVENTS_QUEUE),
    rateLimiter: new CloudflareRateLimiter(env.EVENTS_RATE_LIMITER),
    globalRateLimiter: new CloudflareRateLimiter(
      env.EVENTS_GLOBAL_RATE_LIMITER,
    ),
  });
  const identityRateLimiter = new CloudflareRateLimiter(
    env.IDENTITY_RATE_LIMITER,
  );
  const identityCollector = createIdentityCollector({
    registry,
    queue: new CloudflareIdentityQueueProducer(env.IDENTITY_QUEUE),
    rateLimiter: identityRateLimiter,
    subjectRateLimiter: identityRateLimiter,
    globalRateLimiter: new CloudflareRateLimiter(
      env.IDENTITY_GLOBAL_RATE_LIMITER,
    ),
    encryptionKey: env.IDENTITY_ENCRYPTION_KEY_V1 ?? '',
    hmacKey: env.IDENTITY_HMAC_KEY_V1 ?? '',
  });

  return async function route(
    request: Request,
    ctx: ExecutionContextLike,
  ): Promise<Response> {
    const requestId = crypto.randomUUID();
    const url = new URL(request.url);

    if (url.pathname === '/pixel.js' || url.pathname === VERSIONED_PIXEL_PATH) {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return new Response(null, {
          status: 405,
          headers: { Allow: 'GET, HEAD' },
        });
      }

      return pixelScriptResponse(request, url.pathname);
    }

    if (url.pathname === '/health') {
      if (request.method !== 'GET') {
        return jsonResponse(
          {
            accepted: false,
            error: { code: 'INVALID_REQUEST' },
            request_id: requestId,
          },
          405,
          requestId,
          undefined,
          { Allow: 'GET' },
        );
      }

      return jsonResponse(
        {
          status: 'ok',
          service: 'collector',
          version: COLLECTOR_VERSION,
        },
        200,
        requestId,
      );
    }

    const isEvents = url.pathname === '/v1/events';
    const isIdentity = url.pathname === '/v1/identify';

    if (!isEvents && !isIdentity) {
      return errorResponse(
        new CollectorError(404, 'INVALID_REQUEST'),
        requestId,
      );
    }

    if (request.method === 'OPTIONS') {
      try {
        const origin = parseOrigin(request.headers.get('origin'));

        return new Response(null, {
          status: 204,
          headers: {
            ...corsHeaders(origin.origin),
            'X-Request-Id': requestId,
          },
        });
      } catch (error) {
        return errorResponse(
          error instanceof CollectorError
            ? error
            : new CollectorError(403, 'ORIGIN_NOT_ALLOWED'),
          requestId,
        );
      }
    }

    if (request.method !== 'POST') {
      let origin: string | undefined;

      try {
        origin = parseOrigin(request.headers.get('origin')).origin;
      } catch {
        origin = undefined;
      }

      return jsonResponse(
        {
          accepted: false,
          error: { code: 'INVALID_REQUEST' },
          request_id: requestId,
        },
        405,
        requestId,
        origin,
        { Allow: 'POST, OPTIONS' },
      );
    }

    return isIdentity
      ? identityCollector(request, requestId)
      : collector(request, requestId, ctx);
  };
}
