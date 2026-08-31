import type { SessionFactV1 } from '@funnel/event-contracts';
import {
  SessionEngineError,
  type SessionRepository,
} from '@funnel/session-engine';
import { describe, expect, it } from 'vitest';

import { createSessionConsumer } from './consumer';
import type { SessionDlqProducer } from './dlq';
import type { SessionQueueMessageLike } from './types';

const envelope = {
  envelope_version: 1,
  request_id: '550e8400-e29b-41d4-a716-446655440000',
  generated_at: '2026-08-31T18:00:02.000Z',
  workspace_id: '21000000-0000-0000-0000-000000000001',
  pixel_id: '31000000-0000-0000-0000-000000000001',
  session_ids: ['018bcfe5-6800-7000-8000-000000000003'],
};

function message(body: unknown = envelope, attempts = 1) {
  const state = {
    acked: false,
    retried: false,
  };

  const value: SessionQueueMessageLike = {
    body,
    attempts,
    ack() {
      state.acked = true;
    },
    retry() {
      state.retried = true;
    },
  };

  return { value, state };
}

function dependencies(options?: {
  queryError?: SessionEngineError;
  insertError?: SessionEngineError;
}) {
  const trace: string[] = [];
  const inserted: SessionFactV1[][] = [];
  const dlqMessages: unknown[] = [];
  let queryCalls = 0;

  const repository: SessionRepository = {
    async recomputeGroup(group) {
      queryCalls += 1;
      trace.push('query');

      if (options?.queryError) {
        throw options.queryError;
      }

      return group.session_ids.map(
        (sessionId) =>
          ({
            session_id: sessionId,
          }) as SessionFactV1,
      );
    },
    async insertSnapshots(facts) {
      trace.push('insert');

      if (options?.insertError) {
        throw options.insertError;
      }

      inserted.push(facts);
    },
  };

  const dlq: SessionDlqProducer = {
    async send(input) {
      trace.push('dlq');
      dlqMessages.push(input);
    },
  };

  return {
    repository,
    dlq,
    trace,
    inserted,
    dlqMessages,
    get queryCalls() {
      return queryCalls;
    },
  };
}

describe('Session Worker consumer', () => {
  it('acks only after current session snapshots are inserted', async () => {
    const deps = dependencies();
    const item = message();
    const consume = createSessionConsumer(deps);

    await consume({ messages: [item.value] });

    expect(deps.trace).toEqual(['query', 'insert']);
    expect(item.state.acked).toBe(true);
    expect(item.state.retried).toBe(false);
  });

  it('retries without ack on a transient ClickHouse query failure', async () => {
    const deps = dependencies({
      queryError: new SessionEngineError(
        'TRANSIENT',
        'SESSION_QUERY_FAILED',
      ),
    });
    const item = message();
    const consume = createSessionConsumer(deps);

    await consume({ messages: [item.value] });

    expect(item.state.acked).toBe(false);
    expect(item.state.retried).toBe(true);
  });

  it('sends integrity violations to DLQ before ack', async () => {
    const deps = dependencies({
      queryError: new SessionEngineError(
        'PERMANENT',
        'SESSION_INTEGRITY_VIOLATION',
      ),
    });
    const item = message();
    const consume = createSessionConsumer(deps);

    await consume({ messages: [item.value] });

    expect(deps.trace).toEqual(['query', 'dlq']);
    expect(item.state.acked).toBe(true);
    expect(item.state.retried).toBe(false);
  });

  it('retries without ack when snapshot insert fails transiently', async () => {
    const deps = dependencies({
      insertError: new SessionEngineError(
        'TRANSIENT',
        'SESSION_INSERT_FAILED',
      ),
    });
    const item = message();
    const consume = createSessionConsumer(deps);

    await consume({ messages: [item.value] });

    expect(deps.trace).toEqual(['query', 'insert']);
    expect(item.state.acked).toBe(false);
    expect(item.state.retried).toBe(true);
  });

  it('deduplicates repeated session references within one Queue batch', async () => {
    const deps = dependencies();
    const messages = Array.from({ length: 10 }, () => message());
    const consume = createSessionConsumer(deps);

    await consume({
      messages: messages.map((item) => item.value),
    });

    expect(deps.queryCalls).toBe(1);
    expect(deps.inserted[0]).toHaveLength(1);
    expect(messages.every((item) => item.state.acked)).toBe(true);
  });
});
