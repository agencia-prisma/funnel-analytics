import type {
  IdentityEnvelopeV1,
  IdentityLinkV1,
} from '@funnel/event-contracts';
import type { IdentityLinkWriter } from '@funnel/clickhouse';

import type { IdentityRepository, IdentityResolution } from './control-plane';
import { identityDlqAndAck, type IdentityDlqProducer } from './dlq';
import { validateIdentityEnvelope } from './envelope';
import { IdentityWorkerError } from './errors';
import type { JourneyQueueProducer } from './journey-queue';
import { logIdentityWorker, type IdentityWorkerLogEvent } from './logging';
import { mapIdentityLinkWriteError } from './link-writer';
import { retryIdentityMessage } from './retry';
import type { IdentityQueueBatchLike, IdentityQueueMessageLike } from './types';

export interface IdentityConsumerDependencies {
  repository: IdentityRepository;
  writer: IdentityLinkWriter;
  dlq: IdentityDlqProducer;
  journeys: JourneyQueueProducer;
  now?: () => number;
}

function identifierMetadata(envelope: IdentityEnvelopeV1) {
  return {
    identifier_count: envelope.encrypted_identifiers.length,
    identifier_types: envelope.encrypted_identifiers.map(
      (identifier) => identifier.type,
    ),
  };
}

function resolutionError(
  result: IdentityResolution,
): IdentityWorkerError | null {
  if (result.resolution_status === 'IDENTITY_CONFLICT') {
    return new IdentityWorkerError('PERMANENT', 'IDENTITY_CONFLICT');
  }

  if (result.resolution_status === 'VISITOR_IDENTITY_CONFLICT') {
    return new IdentityWorkerError('PERMANENT', 'VISITOR_IDENTITY_CONFLICT');
  }

  return null;
}

function identityLink(
  envelope: IdentityEnvelopeV1,
  result: IdentityResolution,
): IdentityLinkV1 {
  if (!result.person_id) {
    throw new IdentityWorkerError(
      'PERMANENT',
      'IDENTITY_CONTROL_PLANE_INVALID',
    );
  }

  return {
    link_version: 1,
    workspace_id: envelope.workspace_id,
    person_id: result.person_id,
    visitor_id: envelope.visitor_id,
    pixel_id: envelope.pixel_id,
    source: envelope.source,
    confidence: envelope.confidence,
    linked_at: result.linked_at,
    last_seen_at: result.last_seen_at,
  };
}

async function permanentFailure(
  dependencies: IdentityConsumerDependencies,
  message: IdentityQueueMessageLike,
  envelope: IdentityEnvelopeV1 | null,
  error: IdentityWorkerError,
  batchSize: number,
  now: () => number,
): Promise<void> {
  try {
    await identityDlqAndAck(dependencies.dlq, message, error, now);

    logIdentityWorker('identity.worker.dlq', {
      queue_batch_size: batchSize,
      workspace_id: envelope?.workspace_id,
      pixel_id: envelope?.pixel_id,
      ...(envelope ? identifierMetadata(envelope) : {}),
      status: 'dlq',
      retry_count: Math.max(0, (message.attempts ?? 1) - 1),
      error_code: error.code,
    });
  } catch {
    retryIdentityMessage(message);
  }
}

export function createIdentityConsumer(
  dependencies: IdentityConsumerDependencies,
) {
  const now = dependencies.now ?? Date.now;

  return async function consume(batch: IdentityQueueBatchLike): Promise<void> {
    for (const message of batch.messages) {
      const startedAt = performance.now();
      let envelope: IdentityEnvelopeV1 | null = null;

      try {
        envelope = validateIdentityEnvelope(message.body);
      } catch (error) {
        const workerError =
          error instanceof IdentityWorkerError
            ? error
            : new IdentityWorkerError('PERMANENT', 'IDENTITY_ENVELOPE_INVALID');
        await permanentFailure(
          dependencies,
          message,
          null,
          workerError,
          batch.messages.length,
          now,
        );
        continue;
      }

      let resolution: IdentityResolution;
      const controlPlaneStarted = performance.now();

      try {
        resolution = await dependencies.repository.resolve(envelope);
      } catch (error) {
        const workerError =
          error instanceof IdentityWorkerError
            ? error
            : new IdentityWorkerError(
                'TRANSIENT',
                'IDENTITY_CONTROL_PLANE_UNAVAILABLE',
              );

        if (workerError.kind === 'PERMANENT') {
          await permanentFailure(
            dependencies,
            message,
            envelope,
            workerError,
            batch.messages.length,
            now,
          );
        } else {
          retryIdentityMessage(message);
          logIdentityWorker('identity.worker.retry', {
            queue_batch_size: batch.messages.length,
            workspace_id: envelope.workspace_id,
            pixel_id: envelope.pixel_id,
            ...identifierMetadata(envelope),
            processing_ms: Math.round(performance.now() - startedAt),
            control_plane_ms: Math.round(
              performance.now() - controlPlaneStarted,
            ),
            status: 'retry',
            retry_count: Math.max(0, (message.attempts ?? 1) - 1),
            error_code: workerError.code,
          });
        }
        continue;
      }

      const conflict = resolutionError(resolution);

      if (conflict) {
        logIdentityWorker('identity.worker.conflict', {
          queue_batch_size: batch.messages.length,
          workspace_id: envelope.workspace_id,
          pixel_id: envelope.pixel_id,
          ...identifierMetadata(envelope),
          processing_ms: Math.round(performance.now() - startedAt),
          control_plane_ms: Math.round(performance.now() - controlPlaneStarted),
          status: 'dlq',
          retry_count: Math.max(0, (message.attempts ?? 1) - 1),
          error_code: conflict.code,
        });
        await permanentFailure(
          dependencies,
          message,
          envelope,
          conflict,
          batch.messages.length,
          now,
        );
        continue;
      }

      const link = identityLink(envelope, resolution);
      const clickHouseStarted = performance.now();

      try {
        await dependencies.writer.insertLinks([link]);
      } catch (error) {
        const workerError = mapIdentityLinkWriteError(error);

        if (workerError.kind === 'PERMANENT') {
          await permanentFailure(
            dependencies,
            message,
            envelope,
            workerError,
            batch.messages.length,
            now,
          );
        } else {
          retryIdentityMessage(message);
          logIdentityWorker('identity.worker.retry', {
            queue_batch_size: batch.messages.length,
            workspace_id: envelope.workspace_id,
            pixel_id: envelope.pixel_id,
            ...identifierMetadata(envelope),
            processing_ms: Math.round(performance.now() - startedAt),
            control_plane_ms: Math.round(
              clickHouseStarted - controlPlaneStarted,
            ),
            clickhouse_ms: Math.round(performance.now() - clickHouseStarted),
            status: 'retry',
            retry_count: Math.max(0, (message.attempts ?? 1) - 1),
            error_code: workerError.code,
          });
        }
        continue;
      }

      try {
        await dependencies.journeys.sendIdentityLinked({
          workspaceId: envelope.workspace_id,
          visitorId: envelope.visitor_id,
          personId: link.person_id,
          generatedAt: new Date(now()).toISOString(),
        });
      } catch {
        retryIdentityMessage(message);
        logIdentityWorker('identity.worker.retry', {
          queue_batch_size: batch.messages.length,
          workspace_id: envelope.workspace_id,
          pixel_id: envelope.pixel_id,
          ...identifierMetadata(envelope),
          processing_ms: Math.round(performance.now() - startedAt),
          control_plane_ms: Math.round(clickHouseStarted - controlPlaneStarted),
          clickhouse_ms: Math.round(performance.now() - clickHouseStarted),
          status: 'retry',
          retry_count: Math.max(0, (message.attempts ?? 1) - 1),
          error_code: 'JOURNEY_ENQUEUE_FAILED',
        });
        continue;
      }

      message.ack();

      const event: IdentityWorkerLogEvent = resolution.person_created
        ? 'identity.worker.created_person'
        : 'identity.worker.resolved';

      logIdentityWorker(event, {
        queue_batch_size: batch.messages.length,
        workspace_id: envelope.workspace_id,
        pixel_id: envelope.pixel_id,
        ...identifierMetadata(envelope),
        processing_ms: Math.round(performance.now() - startedAt),
        control_plane_ms: Math.round(clickHouseStarted - controlPlaneStarted),
        clickhouse_ms: Math.round(performance.now() - clickHouseStarted),
        status: 'success',
        retry_count: Math.max(0, (message.attempts ?? 1) - 1),
      });
    }
  };
}
