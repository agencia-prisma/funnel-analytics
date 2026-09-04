import {
  FunnelProgressionError,
  evaluateFunnelProgression,
} from '@funnel/funnel-engine';

import type { FunnelControlPlane } from './control-plane';
import { funnelDlqAndAck, type FunnelDlqProducer } from './dlq';
import { validateFunnelEnvelope } from './envelope';
import { FunnelWorkerError, toFunnelWorkerError } from './errors';
import { logFunnelWorker } from './logging';
import type { FunnelFactsRepository } from './repository';
import type { FunnelQueueBatchLike, FunnelQueueMessageLike } from './types';

export interface FunnelConsumerDependencies {
  controlPlane: FunnelControlPlane;
  repository: FunnelFactsRepository;
  dlq: FunnelDlqProducer;
  now?: () => number;
}

async function permanentFailure(
  dependencies: FunnelConsumerDependencies,
  message: FunnelQueueMessageLike,
  error: FunnelWorkerError,
  now: () => number,
): Promise<void> {
  try {
    await funnelDlqAndAck(dependencies.dlq, message, error, now);
    logFunnelWorker('funnel_worker.dlq', {
      status: 'dlq',
      retry_count: Math.max(0, (message.attempts ?? 1) - 1),
      error_code: error.code,
    });
  } catch {
    message.retry();
  }
}

export function createFunnelConsumer(dependencies: FunnelConsumerDependencies) {
  const now = dependencies.now ?? Date.now;

  return async function consume(batch: FunnelQueueBatchLike): Promise<void> {
    logFunnelWorker('funnel_worker.batch.received', {
      message_count: batch.messages.length,
    });

    for (const message of batch.messages) {
      const startedAt = performance.now();
      let envelope;

      try {
        envelope = validateFunnelEnvelope(message.body);
      } catch (error) {
        await permanentFailure(
          dependencies,
          message,
          toFunnelWorkerError(error),
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

        const definitions = envelope.journey_ids.length
          ? await dependencies.controlPlane.activeDefinitions(
              envelope.workspace_id,
            )
          : [];

        let evaluatedJourneys = 0;
        let stepHitCount = 0;
        let transitionCount = 0;
        let conversionCount = 0;

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

          for (const active of definitions) {
            const result = await evaluateFunnelProgression({
              workspaceId: envelope.workspace_id,
              funnelId: active.funnelId,
              funnelVersionId: active.funnelVersionId,
              funnelVersion: active.funnelVersion,
              journeyId,
              personId: journey.personId,
              testMode: journey.testMode,
              definition: active.definition,
              events,
            });

            await dependencies.repository.replaceFacts({
              workspaceId: envelope.workspace_id,
              funnelVersionId: active.funnelVersionId,
              journeyId,
              sourceJourneyVersion: envelope.source_journey_version,
              updatedAt,
              stepHits: result.stepHits,
              transitions: result.transitions,
              conversions: result.conversions,
            });

            stepHitCount += result.stepHits.length;
            transitionCount += result.transitions.length;
            conversionCount += result.conversions.length;
          }

          evaluatedJourneys += 1;
        }

        message.ack();
        logFunnelWorker('funnel_worker.recompute.completed', {
          workspace_id: envelope.workspace_id,
          source_journey_version: envelope.source_journey_version,
          journey_count: evaluatedJourneys,
          deleted_journey_count: envelope.deleted_journey_ids.length,
          funnel_count: definitions.length,
          step_hit_count: stepHitCount,
          transition_count: transitionCount,
          conversion_count: conversionCount,
          latency: Math.round(performance.now() - startedAt),
          retry_count: Math.max(0, (message.attempts ?? 1) - 1),
        });
      } catch (error) {
        const mapped =
          error instanceof FunnelProgressionError
            ? new FunnelWorkerError('PERMANENT', error.code)
            : toFunnelWorkerError(error);

        if (mapped.kind === 'PERMANENT') {
          logFunnelWorker('funnel_worker.integrity_violation', {
            workspace_id: envelope.workspace_id,
            source_journey_version: envelope.source_journey_version,
            error_code: mapped.code,
          });
          await permanentFailure(dependencies, message, mapped, now);
        } else {
          message.retry();
          logFunnelWorker('funnel_worker.retry', {
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
