import { AttributionWorkerError } from './errors';
import type {
  AttributionDeadLetterEnvelopeV1,
  AttributionDlqBinding,
  AttributionQueueMessageLike,
} from './types';

export interface AttributionDlqProducer {
  send(message: AttributionDeadLetterEnvelopeV1): Promise<void>;
}

export class CloudflareAttributionDlqProducer
  implements AttributionDlqProducer
{
  constructor(private readonly queue: AttributionDlqBinding) {}

  async send(message: AttributionDeadLetterEnvelopeV1): Promise<void> {
    await this.queue.send(message);
  }
}

export async function attributionDlqAndAck(
  producer: AttributionDlqProducer,
  message: AttributionQueueMessageLike,
  error: AttributionWorkerError,
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
    throw new AttributionWorkerError('TRANSIENT', 'ATTRIBUTION_DLQ_FAILED');
  }
}
