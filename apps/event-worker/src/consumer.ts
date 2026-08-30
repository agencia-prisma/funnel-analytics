import type {
  CollectorEnvelopeV1,
  NormalizedEventV1,
} from '@funnel/event-contracts';
import type { ClickHouseWriter } from '@funnel/clickhouse';

import { dlqAndAck, type DlqProducer } from './dlq';
import { validateCollectorEnvelope } from './envelope';
import { PipelineError, toPipelineError } from './errors';
import { logEventWorker } from './logging';
import { emptyMetrics } from './metrics';
import { normalizeEnvelope } from './normalization';
import type { RawArchive } from './raw-archive';
import { retryMessage } from './retry';
import type { QueueBatchLike, QueueMessageLike } from './types';
import { mapClickHouseError } from './clickhouse-writer';

interface Candidate {
  message: QueueMessageLike;
  envelope: CollectorEnvelopeV1;
  events: NormalizedEventV1[];
}

export interface EventConsumerDependencies {
  rawArchive: RawArchive;
  writer: ClickHouseWriter;
  dlq: DlqProducer;
  now?: () => number;
}

export function createEventConsumer(
  dependencies: EventConsumerDependencies,
) {
  const now = dependencies.now ?? Date.now;

  return async function consume(batch: QueueBatchLike): Promise<void> {
    const startedAt = performance.now();
    const metrics = emptyMetrics();
    const candidates: Candidate[] = [];
    let rawArchiveMs = 0;

    for (const message of batch.messages) {
      metrics.events_received +=
        typeof message.body === 'object' &&
        message.body !== null &&
        Array.isArray((message.body as { events?: unknown }).events)
          ? ((message.body as { events: unknown[] }).events.length ?? 0)
          : 0;

      try {
        const envelope = validateCollectorEnvelope(message.body);
        const archiveStartedAt = performance.now();
        await dependencies.rawArchive.archive(envelope);
        rawArchiveMs += performance.now() - archiveStartedAt;

        const events = normalizeEnvelope(envelope);
        metrics.events_normalized += events.length;
        candidates.push({ message, envelope, events });
      } catch (error) {
        const pipelineError = toPipelineError(error);

        if (pipelineError.kind === 'PERMANENT') {
          try {
            await dlqAndAck(
              dependencies.dlq,
              message,
              pipelineError,
              now,
            );
            metrics.events_dlq += 1;
            logEventWorker('event_worker.message.dlq', {
              queue_batch_size: batch.messages.length,
              status: 'dlq',
              retry_count: Math.max(0, (message.attempts ?? 1) - 1),
              error_code: pipelineError.code,
            });
          } catch {
            retryMessage(message);
            metrics.events_retried += 1;
          }
          continue;
        }

        if (pipelineError.code === 'RAW_ARCHIVE_FAILED') {
          metrics.r2_failures += 1;
          logEventWorker('event_worker.raw.failed', {
            queue_batch_size: batch.messages.length,
            status: 'retry',
            retry_count: Math.max(0, (message.attempts ?? 1) - 1),
            error_code: pipelineError.code,
          });
        }

        retryMessage(message);
        metrics.events_retried += 1;
      }
    }

    if (!candidates.length) {
      metrics.processing_latency = performance.now() - startedAt;
      return;
    }

    const events = candidates.flatMap((candidate) => candidate.events);
    const clickHouseStartedAt = performance.now();

    try {
      await dependencies.writer.insertEvents(events);
      const clickhouseMs = performance.now() - clickHouseStartedAt;

      for (const candidate of candidates) {
        candidate.message.ack();
      }

      metrics.events_written += events.length;
      metrics.processing_latency = performance.now() - startedAt;

      logEventWorker('event_worker.batch.completed', {
        queue_batch_size: batch.messages.length,
        envelope_count: candidates.length,
        event_count: events.length,
        workspace_id:
          candidates.length === 1
            ? candidates[0].envelope.workspace_id
            : undefined,
        pixel_id:
          candidates.length === 1
            ? candidates[0].envelope.pixel_id
            : undefined,
        raw_archive_ms: Math.round(rawArchiveMs),
        clickhouse_insert_ms: Math.round(clickhouseMs),
        processing_ms: Math.round(metrics.processing_latency),
        status: 'success',
        retry_count: Math.max(
          0,
          ...candidates.map(
            (candidate) => (candidate.message.attempts ?? 1) - 1,
          ),
        ),
      });
    } catch (error) {
      const pipelineError = mapClickHouseError(error);
      metrics.clickhouse_failures += 1;

      if (pipelineError.kind === 'PERMANENT') {
        for (const candidate of candidates) {
          try {
            await dlqAndAck(
              dependencies.dlq,
              candidate.message,
              pipelineError,
              now,
            );
            metrics.events_dlq += candidate.events.length;
          } catch {
            retryMessage(candidate.message);
            metrics.events_retried += candidate.events.length;
          }
        }
        return;
      }

      for (const candidate of candidates) {
        retryMessage(candidate.message);
        metrics.events_retried += candidate.events.length;
      }

      logEventWorker('event_worker.clickhouse.failed', {
        queue_batch_size: batch.messages.length,
        envelope_count: candidates.length,
        event_count: events.length,
        raw_archive_ms: Math.round(rawArchiveMs),
        clickhouse_insert_ms: Math.round(
          performance.now() - clickHouseStartedAt,
        ),
        processing_ms: Math.round(performance.now() - startedAt),
        status: 'retry',
        retry_count: Math.max(
          0,
          ...candidates.map(
            (candidate) => (candidate.message.attempts ?? 1) - 1,
          ),
        ),
        error_code: pipelineError.code,
      });
    }
  };
}
