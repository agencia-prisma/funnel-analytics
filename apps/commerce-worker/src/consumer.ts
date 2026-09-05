import { CommerceEngineError, evaluateCommerce } from '@funnel/commerce-engine';

import { commerceDlqAndAck, type CommerceDlqProducer } from './dlq';
import { validateCommerceEnvelope } from './envelope';
import { CommerceWorkerError, toCommerceWorkerError } from './errors';
import { logCommerceWorker } from './logging';
import type { CommerceFactsRepository } from './repository';
import type { CommerceQueueBatchLike, CommerceQueueMessageLike } from './types';

export interface CommerceConsumerDependencies {
  repository: CommerceFactsRepository;
  dlq: CommerceDlqProducer;
  now?: () => number;
}

async function permanentFailure(
  dependencies: CommerceConsumerDependencies,
  message: CommerceQueueMessageLike,
  error: CommerceWorkerError,
  now: () => number,
): Promise<void> {
  try {
    await commerceDlqAndAck(dependencies.dlq, message, error, now);
    logCommerceWorker('commerce_worker.dlq', {
      status: 'dlq',
      retry_count: Math.max(0, (message.attempts ?? 1) - 1),
      error_code: error.code,
    });
  } catch {
    message.retry();
  }
}

export function createCommerceConsumer(
  dependencies: CommerceConsumerDependencies,
) {
  const now = dependencies.now ?? Date.now;

  return async function consume(batch: CommerceQueueBatchLike): Promise<void> {
    logCommerceWorker('commerce_worker.batch.received', {
      message_count: batch.messages.length,
    });

    for (const message of batch.messages) {
      const startedAt = performance.now();
      let envelope;
      try {
        envelope = validateCommerceEnvelope(message.body);
      } catch (error) {
        await permanentFailure(
          dependencies,
          message,
          toCommerceWorkerError(error),
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

        let checkoutCount = 0;
        let orderCount = 0;
        let itemCount = 0;
        let evaluatedJourneys = 0;

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
          const events = await dependencies.repository.findEvents(
            envelope.workspace_id,
            journeyId,
          );
          const result = evaluateCommerce({
            workspaceId: envelope.workspace_id,
            journeyId,
            personId: journey.personId,
            testMode: journey.testMode,
            events,
          });
          await dependencies.repository.replaceFacts({
            workspaceId: envelope.workspace_id,
            journeyId,
            sourceJourneyVersion: envelope.source_journey_version,
            updatedAt,
            checkouts: result.checkouts,
            revenue: result.revenue,
            items: result.items,
          });
          checkoutCount += result.checkouts.length;
          orderCount += result.revenue.length;
          itemCount += result.items.length;
          evaluatedJourneys += 1;
        }

        message.ack();
        logCommerceWorker('commerce_worker.recompute.completed', {
          workspace_id: envelope.workspace_id,
          source_journey_version: envelope.source_journey_version,
          journey_count: evaluatedJourneys,
          deleted_journey_count: envelope.deleted_journey_ids.length,
          checkout_count: checkoutCount,
          order_count: orderCount,
          item_count: itemCount,
          latency: Math.round(performance.now() - startedAt),
          retry_count: Math.max(0, (message.attempts ?? 1) - 1),
        });
      } catch (error) {
        const mapped =
          error instanceof CommerceEngineError
            ? new CommerceWorkerError('PERMANENT', error.code)
            : toCommerceWorkerError(error);
        if (mapped.kind === 'PERMANENT') {
          logCommerceWorker('commerce_worker.integrity_violation', {
            workspace_id: envelope.workspace_id,
            source_journey_version: envelope.source_journey_version,
            error_code: mapped.code,
          });
          await permanentFailure(dependencies, message, mapped, now);
        } else {
          message.retry();
          logCommerceWorker('commerce_worker.retry', {
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
