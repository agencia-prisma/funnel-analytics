import {
  ClickHouseWriteError,
  type ClickHouseWriter,
} from '@funnel/clickhouse';
import type { CollectorEnvelopeV1 } from '@funnel/event-contracts';
import { describe, expect, it } from 'vitest';

import { createEventConsumer } from './consumer';
import type { DlqProducer } from './dlq';
import { PipelineError } from './errors';
import type { RawArchive } from './raw-archive';
import type { SessionRecomputeProducer } from './session-recompute';
import { envelope } from './test-fixtures';
import type { QueueMessageLike } from './types';

function message(body: unknown = envelope(), attempts = 1) {
  const state = {
    acked: false,
    retried: false,
  };

  const value: QueueMessageLike = {
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
  archiveFails?: boolean;
  writerFails?: 'transient' | 'permanent';
  sessionQueueFails?: boolean;
}) {
  const trace: string[] = [];
  const dlqMessages: unknown[] = [];
  const sessionCommands: unknown[] = [];

  const rawArchive: RawArchive = {
    async archive(input) {
      trace.push('archive');
      if (options?.archiveFails) {
        throw new PipelineError('TRANSIENT', 'RAW_ARCHIVE_FAILED');
      }
      return {
        key: input.request_id,
        bytes: 1,
      };
    },
    async read() {
      return null;
    },
  };

  const writer: ClickHouseWriter = {
    async insertEvents(events) {
      trace.push('clickhouse');

      if (options?.writerFails === 'transient') {
        throw new ClickHouseWriteError(true);
      }

      if (options?.writerFails === 'permanent') {
        throw new ClickHouseWriteError(false);
      }

      return {
        eventCount: events.length,
        dedupToken: 'token',
      };
    },
  };

  const dlq: DlqProducer = {
    async send(input) {
      trace.push('dlq');
      dlqMessages.push(input);
    },
  };

  const sessions: SessionRecomputeProducer = {
    async enqueue(input) {
      trace.push('sessions');

      if (options?.sessionQueueFails) {
        throw new Error('sessions queue unavailable');
      }

      sessionCommands.push(input);
    },
  };

  return {
    rawArchive,
    writer,
    dlq,
    sessions,
    trace,
    dlqMessages,
    sessionCommands,
  };
}

describe('Event Worker consumer semantics', () => {
  it('acks only after R2, ClickHouse and Sessions Queue succeed', async () => {
    const deps = dependencies();
    const item = message();
    const consume = createEventConsumer(deps);

    await consume({ messages: [item.value] });

    expect(deps.trace).toEqual(['archive', 'clickhouse', 'sessions']);
    expect(deps.sessionCommands).toHaveLength(1);
    expect(item.state.acked).toBe(true);
    expect(item.state.retried).toBe(false);
  });

  it('does not ack when R2 fails and requests Queue retry', async () => {
    const deps = dependencies({ archiveFails: true });
    const item = message();
    const consume = createEventConsumer(deps);

    await consume({ messages: [item.value] });

    expect(item.state.acked).toBe(false);
    expect(item.state.retried).toBe(true);
    expect(deps.trace).not.toContain('clickhouse');
  });

  it('does not ack when ClickHouse fails transiently', async () => {
    const deps = dependencies({ writerFails: 'transient' });
    const item = message();
    const consume = createEventConsumer(deps);

    await consume({ messages: [item.value] });

    expect(deps.trace).toEqual(['archive', 'clickhouse']);
    expect(item.state.acked).toBe(false);
    expect(item.state.retried).toBe(true);
  });

  it('does not ack when Sessions Queue fails after ClickHouse success', async () => {
    const deps = dependencies({ sessionQueueFails: true });
    const item = message();
    const consume = createEventConsumer(deps);

    await consume({ messages: [item.value] });

    expect(deps.trace).toEqual(['archive', 'clickhouse', 'sessions']);
    expect(item.state.acked).toBe(false);
    expect(item.state.retried).toBe(true);
  });

  it('sends permanently invalid envelopes to DLQ and then acks', async () => {
    const deps = dependencies();
    const item = message({
      ...envelope(),
      envelope_version: 999,
    });
    const consume = createEventConsumer(deps);

    await consume({ messages: [item.value] });

    expect(deps.trace).toEqual(['dlq']);
    expect(deps.dlqMessages).toHaveLength(1);
    expect(item.state.acked).toBe(true);
    expect(item.state.retried).toBe(false);
  });

  it('sends permanent ClickHouse errors to DLQ after raw archive', async () => {
    const deps = dependencies({ writerFails: 'permanent' });
    const item = message();
    const consume = createEventConsumer(deps);

    await consume({ messages: [item.value] });

    expect(deps.trace).toEqual(['archive', 'clickhouse', 'dlq']);
    expect(item.state.acked).toBe(true);
    expect(item.state.retried).toBe(false);
  });

  it('batches events and emits grouped session recompute commands', async () => {
    const deps = dependencies();
    let inserted = 0;

    deps.writer.insertEvents = async (events) => {
      inserted += events.length;
      deps.trace.push('clickhouse');
      return {
        eventCount: events.length,
        dedupToken: 'token',
      };
    };

    const first = message(envelope());
    const secondEnvelope: CollectorEnvelopeV1 = {
      ...envelope(),
      request_id: '550e8400-e29b-41d4-a716-446655440001',
      workspace_id: '21000000-0000-0000-0000-000000000002',
      pixel_id: '31000000-0000-0000-0000-000000000002',
      events: [
        {
          ...envelope().events[0],
          event_id: '018bcfe5-6800-7000-8000-000000000010',
          session_id: '018bcfe5-6800-7000-8000-000000000011',
        },
      ],
    };
    const second = message(secondEnvelope);
    const consume = createEventConsumer(deps);

    await consume({ messages: [first.value, second.value] });

    expect(inserted).toBe(2);
    expect(deps.sessionCommands).toHaveLength(2);
    expect(deps.trace).toEqual([
      'archive',
      'archive',
      'clickhouse',
      'sessions',
      'sessions',
    ]);
    expect(first.state.acked).toBe(true);
    expect(second.state.acked).toBe(true);
  });
});
