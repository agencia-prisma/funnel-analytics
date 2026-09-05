import {
  COMMERCE_RECOMPUTE_V1_MAX_JOURNEY_IDS,
  type CommerceRecomputeEnvelopeV1,
} from '@funnel/event-contracts/commerce';
import {
  FUNNEL_RECOMPUTE_V1_MAX_JOURNEY_IDS,
  type FunnelRecomputeEnvelopeV1,
} from '@funnel/event-contracts/funnel';
import {
  JOURNEY_MAX_SESSIONS_PER_RECOMPUTE,
  JOURNEY_MAX_VISITORS_PER_RECOMPUTE,
  JourneyEngineError,
  reconstructJourneys,
  type JourneyPolicyV1,
} from '@funnel/journey-engine';

import type { CommerceRecomputeProducer } from './commerce-publisher';
import { journeyDlqAndAck, type JourneyDlqProducer } from './dlq';
import { validateJourneyEnvelope } from './envelope';
import { JourneyWorkerError, toJourneyWorkerError } from './errors';
import type { FunnelRecomputeProducer } from './funnel-publisher';
import { logJourneyWorker } from './logging';
import type { JourneyRepository } from './repository';
import type { JourneyQueueBatchLike, JourneyQueueMessageLike } from './types';

export interface JourneyConsumerDependencies {
  repository: JourneyRepository;
  dlq: JourneyDlqProducer;
  funnelPublisher?: FunnelRecomputeProducer;
  commercePublisher?: CommerceRecomputeProducer;
  policy: JourneyPolicyV1;
  now?: () => number;
}

async function permanentFailure(
  dependencies: JourneyConsumerDependencies,
  message: JourneyQueueMessageLike,
  error: JourneyWorkerError,
  now: () => number,
): Promise<void> {
  try {
    await journeyDlqAndAck(dependencies.dlq, message, error, now);
    logJourneyWorker('journey_worker.dlq', {
      status: 'dlq',
      retry_count: Math.max(0, (message.attempts ?? 1) - 1),
      error_code: error.code,
    });
  } catch {
    message.retry();
  }
}

function chunks<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

async function publishFunnelRecomputes(input: {
  publisher: FunnelRecomputeProducer;
  workspaceId: string;
  journeyIds: string[];
  deletedJourneyIds: string[];
  sourceJourneyVersion: string;
  generatedAt: string;
}): Promise<void> {
  const references = [
    ...input.journeyIds.map((journeyId) => ({ journeyId, deleted: false })),
    ...input.deletedJourneyIds.map((journeyId) => ({
      journeyId,
      deleted: true,
    })),
  ];

  for (const batch of chunks(references, FUNNEL_RECOMPUTE_V1_MAX_JOURNEY_IDS)) {
    const envelope: FunnelRecomputeEnvelopeV1 = {
      envelope_version: 1,
      request_id: crypto.randomUUID(),
      generated_at: input.generatedAt,
      workspace_id: input.workspaceId,
      reason: 'journey_recomputed',
      journey_ids: batch
        .filter((reference) => !reference.deleted)
        .map((reference) => reference.journeyId),
      deleted_journey_ids: batch
        .filter((reference) => reference.deleted)
        .map((reference) => reference.journeyId),
      source_journey_version: input.sourceJourneyVersion,
    };
    await input.publisher.send(envelope);
  }
}

async function publishCommerceRecomputes(input: {
  publisher: CommerceRecomputeProducer;
  workspaceId: string;
  journeyIds: string[];
  deletedJourneyIds: string[];
  sourceJourneyVersion: string;
  generatedAt: string;
}): Promise<void> {
  const references = [
    ...input.journeyIds.map((journeyId) => ({ journeyId, deleted: false })),
    ...input.deletedJourneyIds.map((journeyId) => ({
      journeyId,
      deleted: true,
    })),
  ];

  for (const batch of chunks(
    references,
    COMMERCE_RECOMPUTE_V1_MAX_JOURNEY_IDS,
  )) {
    const envelope: CommerceRecomputeEnvelopeV1 = {
      envelope_version: 1,
      request_id: crypto.randomUUID(),
      generated_at: input.generatedAt,
      workspace_id: input.workspaceId,
      reason: 'journey_recomputed',
      journey_ids: batch
        .filter((reference) => !reference.deleted)
        .map((reference) => reference.journeyId),
      deleted_journey_ids: batch
        .filter((reference) => reference.deleted)
        .map((reference) => reference.journeyId),
      source_journey_version: input.sourceJourneyVersion,
    };
    await input.publisher.send(envelope);
  }
}

export function createJourneyConsumer(
  dependencies: JourneyConsumerDependencies,
) {
  const now = dependencies.now ?? Date.now;

  return async function consume(batch: JourneyQueueBatchLike): Promise<void> {
    logJourneyWorker('journey_worker.batch.received', {
      subject_count: batch.messages.length,
    });

    for (const message of batch.messages) {
      const startedAt = performance.now();
      let envelope;

      try {
        envelope = validateJourneyEnvelope(message.body);
      } catch (error) {
        await permanentFailure(
          dependencies,
          message,
          toJourneyWorkerError(error),
          now,
        );
        continue;
      }

      try {
        let identityLinks =
          envelope.person_id !== null
            ? await dependencies.repository.findIdentityForPerson(
                envelope.workspace_id,
                envelope.person_id,
              )
            : await dependencies.repository.findIdentityForVisitors(
                envelope.workspace_id,
                envelope.visitor_ids,
              );

        if (identityLinks.length) {
          const personIds = [
            ...new Set(identityLinks.map((link) => link.person_id)),
          ];
          if (personIds.length > 1) {
            throw new JourneyWorkerError(
              'PERMANENT',
              'JOURNEY_IDENTITY_INTEGRITY_VIOLATION',
            );
          }
          identityLinks = await dependencies.repository.findIdentityForPerson(
            envelope.workspace_id,
            personIds[0]!,
          );
        }

        const visitorIds = identityLinks.length
          ? [...new Set(identityLinks.map((link) => link.visitor_id))]
          : [...new Set(envelope.visitor_ids)];

        if (visitorIds.length > JOURNEY_MAX_VISITORS_PER_RECOMPUTE) {
          throw new JourneyWorkerError(
            'PERMANENT',
            'JOURNEY_VISITOR_LIMIT_EXCEEDED',
          );
        }

        const sessions = await dependencies.repository.findSessions(
          envelope.workspace_id,
          visitorIds,
        );

        if (sessions.length > JOURNEY_MAX_SESSIONS_PER_RECOMPUTE) {
          throw new JourneyWorkerError(
            'PERMANENT',
            'JOURNEY_SESSION_LIMIT_EXCEEDED',
          );
        }

        const reconstructed = await reconstructJourneys({
          workspaceId: envelope.workspace_id,
          sessions,
          identityLinks,
          policy: dependencies.policy,
        });

        const sessionIds = reconstructed.sessionLinks.map(
          (link) => link.session_id,
        );
        const previous = await dependencies.repository.previousState(
          envelope.workspace_id,
          sessionIds,
        );
        const version = (BigInt(previous.maxVersion) + 1n).toString();
        const updatedAt = new Date(now()).toISOString();

        await dependencies.repository.insertJourneyFacts(
          reconstructed.journeys,
          version,
          updatedAt,
        );
        await dependencies.repository.insertSessionLinks(
          reconstructed.sessionLinks,
          version,
          updatedAt,
        );

        const currentJourneyIds = new Set(
          reconstructed.journeys.map((journey) => journey.journey_id),
        );
        const staleJourneyIds = previous.journeyIds.filter(
          (journeyId) => !currentJourneyIds.has(journeyId),
        );
        await dependencies.repository.tombstoneJourneys(
          envelope.workspace_id,
          staleJourneyIds,
          version,
          updatedAt,
        );

        if (dependencies.funnelPublisher) {
          await publishFunnelRecomputes({
            publisher: dependencies.funnelPublisher,
            workspaceId: envelope.workspace_id,
            journeyIds: [...currentJourneyIds],
            deletedJourneyIds: staleJourneyIds,
            sourceJourneyVersion: version,
            generatedAt: updatedAt,
          });
        }

        if (dependencies.commercePublisher) {
          await publishCommerceRecomputes({
            publisher: dependencies.commercePublisher,
            workspaceId: envelope.workspace_id,
            journeyIds: [...currentJourneyIds],
            deletedJourneyIds: staleJourneyIds,
            sourceJourneyVersion: version,
            generatedAt: updatedAt,
          });
        }

        message.ack();

        logJourneyWorker('journey_worker.recompute.completed', {
          workspace_id: envelope.workspace_id,
          reason: envelope.reason,
          session_count: sessions.length,
          journey_count: reconstructed.journeys.length,
          latency: Math.round(performance.now() - startedAt),
          retry_count: Math.max(0, (message.attempts ?? 1) - 1),
        });
      } catch (error) {
        const mapped =
          error instanceof JourneyEngineError
            ? new JourneyWorkerError('PERMANENT', error.code)
            : toJourneyWorkerError(error);

        if (mapped.kind === 'PERMANENT') {
          logJourneyWorker('journey_worker.integrity_violation', {
            workspace_id: envelope.workspace_id,
            reason: envelope.reason,
            error_code: mapped.code,
          });
          await permanentFailure(dependencies, message, mapped, now);
        } else {
          message.retry();
          logJourneyWorker('journey_worker.retry', {
            workspace_id: envelope.workspace_id,
            reason: envelope.reason,
            retry_count: Math.max(0, (message.attempts ?? 1) - 1),
            error_code: mapped.code,
          });
        }
      }
    }
  };
}
