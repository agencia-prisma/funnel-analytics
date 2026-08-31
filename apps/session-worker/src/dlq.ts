import type {
  PipelineFailureKind,
  SessionDeadLetterEnvelopeV1,
} from '@funnel/event-contracts';

import type {
  SessionDlqBinding,
  SessionQueueMessageLike,
} from './types';

export interface SessionDlqProducer {
  send(input: {
    envelope: unknown;
    kind: PipelineFailureKind;
    code: string;
    retryCount: number;
    failedAt: string;
  }): Promise<void>;
}

export class CloudflareSessionDlqProducer implements SessionDlqProducer {
  constructor(private readonly binding: SessionDlqBinding) {}

  async send(input: {
    envelope: unknown;
    kind: PipelineFailureKind;
    code: string;
    retryCount: number;
    failedAt: string;
  }): Promise<void> {
    const body: SessionDeadLetterEnvelopeV1 = {
      dlq_version: 1,
      failed_at: input.failedAt,
      failure_kind: input.kind,
      error_code: input.code,
      retry_count: input.retryCount,
      envelope: input.envelope,
    };

    await this.binding.send(body);
  }
}

export async function sessionDlqAndAck(
  producer: SessionDlqProducer,
  message: SessionQueueMessageLike,
  input: {
    kind: PipelineFailureKind;
    code: string;
  },
  now: () => number,
): Promise<void> {
  await producer.send({
    envelope: message.body,
    kind: input.kind,
    code: input.code,
    retryCount: Math.max(0, (message.attempts ?? 1) - 1),
    failedAt: new Date(now()).toISOString(),
  });
  message.ack();
}
