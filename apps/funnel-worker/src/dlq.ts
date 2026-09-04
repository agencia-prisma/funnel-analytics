import { FunnelWorkerError } from './errors';
import type {
  FunnelDeadLetterEnvelopeV1,
  FunnelDlqBinding,
  FunnelQueueMessageLike,
} from './types';

export interface FunnelDlqProducer {
  send(message: FunnelDeadLetterEnvelopeV1): Promise<void>;
}

export class CloudflareFunnelDlqProducer implements FunnelDlqProducer {
  constructor(private readonly queue: FunnelDlqBinding) {}

  async send(message: FunnelDeadLetterEnvelopeV1): Promise<void> {
    await this.queue.send(message);
  }
}

export async function funnelDlqAndAck(
  producer: FunnelDlqProducer,
  message: FunnelQueueMessageLike,
  error: FunnelWorkerError,
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
    throw new FunnelWorkerError('TRANSIENT', 'FUNNEL_DLQ_FAILED');
  }
}
