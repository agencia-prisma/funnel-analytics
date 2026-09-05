import {
  AttributionEngineError,
  evaluateAttribution,
} from '@funnel/attribution-engine';

import { attributionDlqAndAck, type AttributionDlqProducer } from './dlq';
import { validateAttributionEnvelope } from './envelope';
import { AttributionWorkerError, toAttributionWorkerError } from './errors';
import { logAttributionWorker } from './logging';
import type { AttributionFactsRepository } from './repository';
import type {
  AttributionQueueBatchLike,
  AttributionQueueMessageLike,
} from './types';

export interface AttributionConsumerDependencies {
  repository: AttributionFactsRepository;
  dlq: AttributionDlqProducer;
  now?: () => number;
}

async function permanentFailure(
  dependencies: AttributionConsumerDependencies,
  message: AttributionQueueMessageLike,
  error: AttributionWorkerError,
  now: () => number,
): Promise<void> {
  try {
    await attributionDlqAndAck(dependencies.dlq, message, error, now);
    logAttributionWorker('attribution_worker.dlq', {
      status: 'dlq',
      retry_count: Math.max(0, (message.attempts ?? 1) - 1),
      error_code: error.code,
    });
  } catch {
    message.retry();
  }
}

export function createAttributionConsumer(
  dependencies: AttributionConsumerDependencies,
) {
  const now = dependencies.now ?? Date.now;

  return async function consume(
    batch: AttributionQueueBatchLike,
  ): Promise<void> {
    logAttributionWorker('attribution_worker.batch.received', {
      message_count: batch.messages.length,
    });

    for (const message of batch.messages) {
      const startedAt = performance.now();
      let envelope;
      try {
        envelope = validateAttributionEnvelope(message.body);
      } catch (error) {
        await permanentFailure(
          dependencies,
          message,
          toAttributionWorkerError(error),
          now,
        );
        continue;
      }

      try {
        const updatedAt = new Date(now()).toISOString();
        for (const journeyId of envelope.deleted_journey_ids) {
          await dependencies.repository.tombstoneJourneyFacts(
            envelope.workspace_id,
            journeyId,
            envelope.source_journey_version,
            updatedAt,
          );
        }

        let evaluatedJourneys = 0;
        let orderCount = 0;
        let touchpointCount = 0;
        let factCount = 0;

        for (const journeyId of envelope.journey_ids) {
          const journey = await dependencies.repository.findJourney(
            envelope.workspace_id,
            journeyId,
          );
          if (!journey) {
            await dependencies.repository.tombstoneJourneyFacts(
              envelope.workspace_id,
              journeyId,
              envelope.source_journey_version,
              updatedAt,
            );
            continue;
          }

          const orders = await dependencies.repository.findOrders(
            envelope.workspace_id,
            journeyId,
          );
          const events = orders.length
            ? await dependencies.repository.findEvents(
                envelope.workspace_id,
                journeyId,
              )
            : [];
          const facts = [];

          for (const order of orders) {
            const result = evaluateAttribution({
              order,
              events,
              lookbackWindowSeconds: journey.inactivityWindowSeconds,
            });
            facts.push(...result.facts);
            touchpointCount += result.touchpoints.length;
            factCount += result.facts.length;
            orderCount += 1;
          }

          await dependencies.repository.replaceJourneyFacts({
            workspaceId: envelope.workspace_id,
            journeyId,
            sourceJourneyVersion: envelope.source_journey_version,
            updatedAt,
            facts,
          });
          evaluatedJourneys += 1;
        }

        message.ack();
        logAttributionWorker('attribution_worker.recompute.completed', {
          workspace_id: envelope.workspace_id,
          source_journey_version: envelope.source_journey_version,
          journey_count: evaluatedJourneys,
          deleted_journey_count: envelope.deleted_journey_ids.length,
          order_count: orderCount,
          touchpoint_count: touchpointCount,
          fact_count: factCount,
          latency: Math.round(performance.now() - startedAt),
          retry_count: Math.max(0, (message.attempts ?? 1) - 1),
        });
      } catch (error) {
        const mapped =
          error instanceof AttributionEngineError
            ? new AttributionWorkerError('PERMANENT', error.code)
            : toAttributionWorkerError(error);
        if (mapped.kind === 'PERMANENT') {
          logAttributionWorker('attribution_worker.integrity_violation', {
            workspace_id: envelope.workspace_id,
            source_journey_version: envelope.source_journey_version,
            error_code: mapped.code,
          });
          await permanentFailure(dependencies, message, mapped, now);
        } else {
          message.retry();
          logAttributionWorker('attribution_worker.retry', {
            workspace_id: envelope.workspace_id,
            source_journey_version: envelope.source_journey_version,
            retry_count: Math.max(0, (message.attempts ?? 1) - 1),
            error_code: mapped.code,
          });
        }
      }
    }
  };
}
