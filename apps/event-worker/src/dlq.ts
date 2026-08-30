import type {
  DeadLetterEnvelopeV1,
  PipelineFailureKind,
} from '@funnel/event-contracts';

import { PipelineError } from './errors';
import type { DlqBinding, QueueMessageLike } from './types';

export interface DlqProducer {
  send(input: {
    envelope: unknown;
    kind: PipelineFailureKind;
    code: string;
    retryCount: number;
    failedAt: string;
  }): Promise<void>;
}

export class CloudflareDlqProducer implements DlqProducer {
  constructor(private readonly binding: DlqBinding) {}

  async send(input: {
    envelope: unknown;
    kind: PipelineFailureKind;
    code: string;
    retryCount: number;
    failedAt: string;
  }): Promise<void> {
    const message: DeadLetterEnvelopeV1 = {
      dlq_version: 1,
      failed_at: input.failedAt,
      failure_kind: input.kind,
      error_code: input.code,
      retry_count: input.retryCount,
      envelope: input.envelope,
    };

    try {
      await this.binding.send(message);
    } catch {
      throw new PipelineError('TRANSIENT', 'DLQ_FAILED');
    }
  }
}

export async function dlqAndAck(
  producer: DlqProducer,
  message: QueueMessageLike,
  error: PipelineError,
  now: () => number,
): Promise<void> {
  await producer.send({
    envelope: message.body,
    kind: error.kind,
    code: error.code,
    retryCount: Math.max(0, (message.attempts ?? 1) - 1),
    failedAt: new Date(now()).toISOString(),
  });
  message.ack();
}
