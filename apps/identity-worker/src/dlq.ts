import type {
  IdentityDeadLetterEnvelopeV1,
  PipelineFailureKind,
} from '@funnel/event-contracts';

import { IdentityWorkerError } from './errors';
import type { IdentityDlqBinding, IdentityQueueMessageLike } from './types';

export interface IdentityDlqProducer {
  send(input: {
    envelope: unknown;
    kind: PipelineFailureKind;
    code: string;
    retryCount: number;
    failedAt: string;
  }): Promise<void>;
}

export class CloudflareIdentityDlqProducer implements IdentityDlqProducer {
  constructor(private readonly binding: IdentityDlqBinding) {}

  async send(input: {
    envelope: unknown;
    kind: PipelineFailureKind;
    code: string;
    retryCount: number;
    failedAt: string;
  }): Promise<void> {
    const payload: IdentityDeadLetterEnvelopeV1 = {
      dlq_version: 1,
      failed_at: input.failedAt,
      failure_kind: input.kind,
      error_code: input.code,
      retry_count: input.retryCount,
      envelope: input.envelope,
    };

    try {
      await this.binding.send(payload);
    } catch {
      throw new IdentityWorkerError('TRANSIENT', 'IDENTITY_DLQ_FAILED');
    }
  }
}

export async function identityDlqAndAck(
  producer: IdentityDlqProducer,
  message: IdentityQueueMessageLike,
  error: IdentityWorkerError,
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
