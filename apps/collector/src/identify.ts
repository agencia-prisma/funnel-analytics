import { IDENTIFY_V1_MAX_BODY_BYTES } from '@funnel/event-contracts';
import {
  IdentityError,
  normalizeIdentifierSet,
  protectIdentifiers,
} from '@funnel/identity';

import { parseOrigin } from './cors';
import { CollectorError } from './errors';
import { validateIdentifyRequest } from './identify-validation';
import type { IdentityQueueProducer } from './identity-queue';
import { logCollector } from './logging';
import { authorizePixel } from './pixel-auth';
import type { PixelRegistry } from './pixel-registry';
import type { RateLimiter } from './rate-limit';
import { readJsonBody, requireJsonContentType } from './request';
import { errorResponse, jsonResponse } from './responses';

export interface IdentityCollectorDependencies {
  registry: PixelRegistry;
  queue: IdentityQueueProducer;
  rateLimiter: RateLimiter;
  encryptionKey: string;
  hmacKey: string;
  encryptionKeyVersion?: number;
  now?: () => number;
}

function mapIdentityError(error: IdentityError): CollectorError {
  if (error.code === 'IDENTITY_CRYPTO_KEY_INVALID') {
    return new CollectorError(503, 'IDENTITY_CRYPTO_UNAVAILABLE');
  }

  return new CollectorError(422, 'INVALID_IDENTITY');
}

export function createIdentityCollector(
  dependencies: IdentityCollectorDependencies,
) {
  return async function identify(
    request: Request,
    requestId: string,
  ): Promise<Response> {
    const startedAt = performance.now();
    let origin: ReturnType<typeof parseOrigin> | null = null;

    try {
      origin = parseOrigin(request.headers.get('origin'));
      requireJsonContentType(request);

      const now = dependencies.now?.() ?? Date.now();
      const rawBody = await readJsonBody(request, IDENTIFY_V1_MAX_BODY_BYTES);
      const payload = validateIdentifyRequest(rawBody, now);

      const allowed = await dependencies.rateLimiter.allow(
        payload.pixel_key,
        request,
        `identity:${origin.host}`,
      );

      if (!allowed) {
        logCollector('identity.request.rate_limited', {
          request_id: requestId,
          origin_host: origin.host,
          identifier_count: Object.keys(payload.identifiers).length,
          identifier_types: Object.keys(payload.identifiers),
          status_code: 429,
          latency_ms: Math.round(performance.now() - startedAt),
        });
        throw new CollectorError(429, 'RATE_LIMITED', 60);
      }

      const { pixel } = await authorizePixel({
        registry: dependencies.registry,
        pixelKey: payload.pixel_key,
        originHost: origin.host,
      });

      let protectedIdentifiers;

      try {
        const normalized = normalizeIdentifierSet(payload.identifiers);
        protectedIdentifiers = await protectIdentifiers(normalized, {
          encryptionKey: dependencies.encryptionKey,
          hmacKey: dependencies.hmacKey,
          encryptionKeyVersion: dependencies.encryptionKeyVersion ?? 1,
        });
      } catch (error) {
        if (error instanceof IdentityError) {
          throw mapIdentityError(error);
        }

        throw error;
      }

      const receivedAt = new Date(now).toISOString();
      const envelope = {
        envelope_version: 1 as const,
        request_id: requestId,
        received_at: receivedAt,
        workspace_id: pixel.workspace_id,
        pixel_id: pixel.id,
        visitor_id: payload.visitor_id,
        session_id: payload.session_id,
        encrypted_identifiers: protectedIdentifiers,
        source: 'manual_browser_identify' as const,
        confidence: 'high' as const,
        test_mode: payload.test_mode,
      };

      const queueStartedAt = performance.now();

      try {
        await dependencies.queue.enqueue(envelope);
      } catch {
        logCollector('identity.queue.failed', {
          request_id: requestId,
          workspace_id: pixel.workspace_id,
          pixel_id: pixel.id,
          origin_host: origin.host,
          identifier_count: protectedIdentifiers.length,
          identifier_types: protectedIdentifiers.map(
            (identifier) => identifier.type,
          ),
          status_code: 503,
          latency_ms: Math.round(performance.now() - startedAt),
          queue_latency_ms: Math.round(performance.now() - queueStartedAt),
        });
        throw new CollectorError(503, 'IDENTITY_QUEUE_UNAVAILABLE');
      }

      logCollector('identity.request.accepted', {
        request_id: requestId,
        workspace_id: pixel.workspace_id,
        pixel_id: pixel.id,
        origin_host: origin.host,
        identifier_count: protectedIdentifiers.length,
        identifier_types: protectedIdentifiers.map(
          (identifier) => identifier.type,
        ),
        status_code: 202,
        latency_ms: Math.round(performance.now() - startedAt),
        queue_latency_ms: Math.round(performance.now() - queueStartedAt),
      });

      return jsonResponse(
        {
          accepted: true,
          request_id: requestId,
        },
        202,
        requestId,
        origin.origin,
      );
    } catch (error) {
      const collectorError =
        error instanceof CollectorError
          ? error
          : new CollectorError(500, 'INTERNAL_ERROR');

      logCollector('identity.request.rejected', {
        request_id: requestId,
        origin_host: origin?.host,
        status_code: collectorError.status,
        latency_ms: Math.round(performance.now() - startedAt),
        error_code: collectorError.code,
      });

      return errorResponse(collectorError, requestId, origin?.origin);
    }
  };
}
