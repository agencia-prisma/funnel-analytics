import { CommerceWorkerError } from './errors';
import type {
  CommerceDeadLetterEnvelopeV1,
  CommerceDlqBinding,
  CommerceQueueMessageLike,
} from './types';

export interface CommerceDlqProducer {
  send(message: CommerceDeadLetterEnvelopeV1): Promise<void>;
}

export class CloudflareCommerceDlqProducer implements CommerceDlqProducer {
  constructor(private readonly queue: CommerceDlqBinding) {}
  async send(message: CommerceDeadLetterEnvelopeV1): Promise<void> {
    await this.queue.send(message);
  }
}

export async function commerceDlqAndAck(
  producer: CommerceDlqProducer,
  message: CommerceQueueMessageLike,
  error: CommerceWorkerError,
  now: () => number,
): Promise<void> {
  try {
    await producer.send({
      dlq_version: 1,
      failed_at: new Date(now()).toISOString(),
      failure_kind: error.kind,
      error_code: error.code,
      retry_count: Math.max(0, (message.attempts ?? 1) - 1),
      envelope: message.body,
    });
    message.ack();
  } catch {
    throw new CommerceWorkerError('TRANSIENT', 'COMMERCE_DLQ_FAILED');
  }
}
