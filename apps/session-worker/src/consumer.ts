import {
  SessionEngineError,
  toSessionEngineError,
  validateSessionRecomputeEnvelope,
  type SessionQueryGroup,
  type SessionRepository,
} from '@funnel/session-engine';
import type { SessionFactV1 } from '@funnel/event-contracts';

import {
  sessionDlqAndAck,
  type SessionDlqProducer,
} from './dlq';
import { logSessionWorker } from './logging';
import { retrySessionMessage } from './retry';
import type {
  SessionQueueBatchLike,
  SessionQueueMessageLike,
} from './types';

const MAX_SESSION_REFERENCES_PER_INVOCATION = 500;

interface ValidMessage {
  message: SessionQueueMessageLike;
  workspace_id: string;
  pixel_id: string;
  session_ids: string[];
}

interface SessionGroupState {
  workspace_id: string;
  pixel_id: string;
  session_ids: Set<string>;
  messages: Set<SessionQueueMessageLike>;
}

export interface SessionConsumerDependencies {
  repository: SessionRepository;
  dlq: SessionDlqProducer;
  now?: () => number;
}

function chunks<T>(values: T[], size: number): T[][] {
  const output: T[][] = [];

  for (let offset = 0; offset < values.length; offset += size) {
    output.push(values.slice(offset, offset + size));
  }

  return output;
}

async function dlqMessages(
  producer: SessionDlqProducer,
  messages: Iterable<SessionQueueMessageLike>,
  error: SessionEngineError,
  now: () => number,
  batchSize: number,
): Promise<void> {
  for (const message of messages) {
    try {
      await sessionDlqAndAck(producer, message, error, now);
      logSessionWorker('session_worker.dlq', {
        queue_batch_size: batchSize,
        status: 'dlq',
        retry_count: Math.max(0, (message.attempts ?? 1) - 1),
        error_code: error.code,
      });
    } catch {
      retrySessionMessage(message);
    }
  }
}

export function createSessionConsumer(
  dependencies: SessionConsumerDependencies,
) {
  const now = dependencies.now ?? Date.now;

  return async function consume(batch: SessionQueueBatchLike): Promise<void> {
    const startedAt = performance.now();
    const validMessages: ValidMessage[] = [];

    logSessionWorker('session_worker.batch.received', {
      queue_batch_size: batch.messages.length,
      status: 'success',
    });

    for (const message of batch.messages) {
      try {
        const envelope = validateSessionRecomputeEnvelope(message.body);
        validMessages.push({
          message,
          workspace_id: envelope.workspace_id,
          pixel_id: envelope.pixel_id,
          session_ids: [...new Set(envelope.session_ids)],
        });
      } catch (error) {
        const sessionError = toSessionEngineError(error);

        if (sessionError.kind === 'PERMANENT') {
          await dlqMessages(
            dependencies.dlq,
            [message],
            sessionError,
            now,
            batch.messages.length,
          );
        } else {
          retrySessionMessage(message);
        }
      }
    }

    const totalReferences = validMessages.reduce(
      (sum, item) => sum + item.session_ids.length,
      0,
    );

    if (totalReferences > MAX_SESSION_REFERENCES_PER_INVOCATION) {
      const error = new SessionEngineError(
        'PERMANENT',
        'SESSION_BATCH_TOO_LARGE',
      );
      await dlqMessages(
        dependencies.dlq,
        validMessages.map((item) => item.message),
        error,
        now,
        batch.messages.length,
      );
      return;
    }

    const groups = new Map<string, SessionGroupState>();

    for (const item of validMessages) {
      const key = `${item.workspace_id}:${item.pixel_id}`;
      const existing = groups.get(key);

      if (existing) {
        item.session_ids.forEach((sessionId) =>
          existing.session_ids.add(sessionId),
        );
        existing.messages.add(item.message);
        continue;
      }

      groups.set(key, {
        workspace_id: item.workspace_id,
        pixel_id: item.pixel_id,
        session_ids: new Set(item.session_ids),
        messages: new Set([item.message]),
      });
    }

    const facts: SessionFactV1[] = [];
    const successfulMessages = new Set<SessionQueueMessageLike>();
    let queryMs = 0;

    for (const group of groups.values()) {
      const groupFacts: SessionFactV1[] = [];
      let failed = false;

      for (const sessionIds of chunks([...group.session_ids].sort(), 100)) {
        const queryGroup: SessionQueryGroup = {
          workspace_id: group.workspace_id,
          pixel_id: group.pixel_id,
          session_ids: sessionIds,
        };

        const queryStartedAt = performance.now();

        try {
          groupFacts.push(
            ...(await dependencies.repository.recomputeGroup(queryGroup)),
          );
          queryMs += performance.now() - queryStartedAt;
        } catch (error) {
          queryMs += performance.now() - queryStartedAt;
          const sessionError = toSessionEngineError(error);
          failed = true;

          if (sessionError.kind === 'PERMANENT') {
            logSessionWorker('session_worker.integrity_violation', {
              queue_batch_size: batch.messages.length,
              session_count: group.session_ids.size,
              workspace_id: group.workspace_id,
              pixel_id: group.pixel_id,
              query_ms: Math.round(queryMs),
              processing_ms: Math.round(performance.now() - startedAt),
              status: 'dlq',
              error_code: sessionError.code,
            });
            await dlqMessages(
              dependencies.dlq,
              group.messages,
              sessionError,
              now,
              batch.messages.length,
            );
          } else {
            for (const message of group.messages) {
              retrySessionMessage(message);
            }
            logSessionWorker('session_worker.recompute.failed', {
              queue_batch_size: batch.messages.length,
              session_count: group.session_ids.size,
              workspace_id: group.workspace_id,
              pixel_id: group.pixel_id,
              query_ms: Math.round(queryMs),
              processing_ms: Math.round(performance.now() - startedAt),
              status: 'retry',
              error_code: sessionError.code,
            });
          }

          break;
        }
      }

      if (!failed) {
        facts.push(...groupFacts);
        group.messages.forEach((message) => successfulMessages.add(message));
      }
    }

    if (!successfulMessages.size) {
      return;
    }

    const insertStartedAt = performance.now();

    try {
      await dependencies.repository.insertSnapshots(facts);
      const insertMs = performance.now() - insertStartedAt;

      successfulMessages.forEach((message) => message.ack());

      logSessionWorker('session_worker.recompute.completed', {
        queue_batch_size: batch.messages.length,
        session_count: facts.length,
        query_ms: Math.round(queryMs),
        insert_ms: Math.round(insertMs),
        processing_ms: Math.round(performance.now() - startedAt),
        status: 'success',
        retry_count: Math.max(
          0,
          ...[...successfulMessages].map(
            (message) => (message.attempts ?? 1) - 1,
          ),
        ),
      });
    } catch (error) {
      const sessionError = toSessionEngineError(error);

      if (sessionError.kind === 'PERMANENT') {
        await dlqMessages(
          dependencies.dlq,
          successfulMessages,
          sessionError,
          now,
          batch.messages.length,
        );
        return;
      }

      successfulMessages.forEach(retrySessionMessage);

      logSessionWorker('session_worker.recompute.failed', {
        queue_batch_size: batch.messages.length,
        session_count: facts.length,
        query_ms: Math.round(queryMs),
        insert_ms: Math.round(performance.now() - insertStartedAt),
        processing_ms: Math.round(performance.now() - startedAt),
        status: 'retry',
        error_code: sessionError.code,
      });
    }
  };
}
