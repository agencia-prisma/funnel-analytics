import { domainMatchesAuthorizedPattern } from '@funnel/pixel/domains';

import { parseOrigin } from './cors';
import { CollectorError } from './errors';
import { logCollector } from './logging';
import type {
  PixelDomainRecord,
  PixelRecord,
  PixelRegistry,
} from './pixel-registry';
import { ControlPlaneUnavailableError } from './pixel-registry-supabase';
import { createCollectorEnvelope, type QueueProducer } from './queue';
import type { RateLimiter } from './rate-limit';
import { readJsonBody, requireJsonContentType } from './request';
import { acceptedResponse, errorResponse } from './responses';
import type { ExecutionContextLike } from './types';
import { assertPageUrlsMatchOrigin, validateEventBatch } from './validation';

export const COLLECTOR_VERSION = '0.1.0';

export interface CollectorDependencies {
  registry: PixelRegistry;
  queue: QueueProducer;
  rateLimiter: RateLimiter;
  now?: () => number;
}

function findAuthorizedDomain(
  pixel: PixelRecord,
  originHost: string,
): PixelDomainRecord | null {
  for (const domain of pixel.domains) {
    if (domain.status === 'blocked') {
      continue;
    }

    if (
      domainMatchesAuthorizedPattern(originHost, {
        domain: domain.domain,
        wildcard: domain.wildcard,
      })
    ) {
      return domain;
    }
  }

  return null;
}

export function createCollector(dependencies: CollectorDependencies) {
  return async function collect(
    request: Request,
    requestId: string,
    ctx: ExecutionContextLike,
  ): Promise<Response> {
    const startedAt = performance.now();
    let origin: ReturnType<typeof parseOrigin> | null = null;

    try {
      origin = parseOrigin(request.headers.get('origin'));
      const originHost = originHost;
      const originValue = origin.origin;
      requireJsonContentType(request);

      const rawBody = await readJsonBody(request);
      const now = dependencies.now?.() ?? Date.now();
      const { batch, pixelKey } = validateEventBatch(rawBody, now);

      const allowed = await dependencies.rateLimiter.allow(pixelKey, request);

      if (!allowed) {
        logCollector('collector.rate_limited', {
          request_id: requestId,
          origin_host: originHost,
          event_count: batch.events.length,
          status_code: 429,
          latency_ms: Math.round(performance.now() - startedAt),
        });
        throw new CollectorError(429, 'RATE_LIMITED', 60);
      }

      let pixel: PixelRecord | null;

      try {
        pixel = await dependencies.registry.resolvePixel(pixelKey);
      } catch (error) {
        if (error instanceof ControlPlaneUnavailableError) {
          logCollector('collector.control_plane.failed', {
            request_id: requestId,
            origin_host: originHost,
            event_count: batch.events.length,
            status_code: 503,
            latency_ms: Math.round(performance.now() - startedAt),
          });
          throw new CollectorError(503, 'CONTROL_PLANE_UNAVAILABLE');
        }

        throw error;
      }

      if (!pixel || pixel.status !== 'active') {
        logCollector('collector.pixel.invalid', {
          request_id: requestId,
          workspace_id: pixel?.workspace_id,
          pixel_id: pixel?.id,
          origin_host: originHost,
          event_count: batch.events.length,
          status_code: 404,
          latency_ms: Math.round(performance.now() - startedAt),
        });
        throw new CollectorError(404, 'PIXEL_NOT_AVAILABLE');
      }

      const domain = findAuthorizedDomain(pixel, originHost);

      if (!domain) {
        logCollector('collector.origin.rejected', {
          request_id: requestId,
          workspace_id: pixel.workspace_id,
          pixel_id: pixel.id,
          origin_host: originHost,
          event_count: batch.events.length,
          status_code: 403,
          latency_ms: Math.round(performance.now() - startedAt),
        });
        throw new CollectorError(403, 'ORIGIN_NOT_ALLOWED');
      }

      assertPageUrlsMatchOrigin(batch, originHost);

      const receivedAt = new Date(now).toISOString();
      const envelope = createCollectorEnvelope({
        requestId,
        receivedAt,
        collectorVersion: COLLECTOR_VERSION,
        workspaceId: pixel.workspace_id,
        pixelId: pixel.id,
        originHost: originHost,
        events: batch.events,
      });

      const queueStartedAt = performance.now();

      try {
        await dependencies.queue.enqueue(envelope);
      } catch {
        logCollector('collector.queue.failed', {
          request_id: requestId,
          workspace_id: pixel.workspace_id,
          pixel_id: pixel.id,
          origin_host: originHost,
          event_count: batch.events.length,
          status_code: 503,
          latency_ms: Math.round(performance.now() - startedAt),
          queue_latency_ms: Math.round(performance.now() - queueStartedAt),
        });
        throw new CollectorError(503, 'QUEUE_UNAVAILABLE');
      }

      ctx.waitUntil(
        dependencies.registry
          .touchAccepted(pixel, domain, receivedAt)
          .catch(() => {
            logCollector('collector.control_plane.failed', {
              request_id: requestId,
              workspace_id: pixel.workspace_id,
              pixel_id: pixel.id,
              origin_host: originHost,
              event_count: batch.events.length,
              status_code: 202,
            });
          }),
      );

      logCollector('collector.request.accepted', {
        request_id: requestId,
        workspace_id: pixel.workspace_id,
        pixel_id: pixel.id,
        origin_host: originHost,
        event_count: batch.events.length,
        status_code: 202,
        latency_ms: Math.round(performance.now() - startedAt),
        queue_latency_ms: Math.round(performance.now() - queueStartedAt),
      });

      return acceptedResponse(batch.events.length, requestId, originValue);
    } catch (error) {
      const collectorError =
        error instanceof CollectorError
          ? error
          : new CollectorError(500, 'INTERNAL_ERROR');

      logCollector('collector.request.rejected', {
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
