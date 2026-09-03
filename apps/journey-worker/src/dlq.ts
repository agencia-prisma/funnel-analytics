import type { JourneyDeadLetterEnvelopeV1 } from '@funnel/event-contracts';

import type { JourneyWorkerError } from './errors';
import type { JourneyDlqBinding, JourneyQueueMessageLike } from './types';

export interface JourneyDlqProducer {
  send(message: JourneyDeadLetterEnvelopeV1): Promise<void>;
}

export class CloudflareJourneyDlqProducer implements JourneyDlqProducer {
  constructor(private readonly binding: JourneyDlqBinding) {}

  send(message: JourneyDeadLetterEnvelopeV1): Promise<void> {
    return this.binding.send(message);
  }
}

export async function journeyDlqAndAck(
  producer: JourneyDlqProducer,
  message: JourneyQueueMessageLike,
  error: JourneyWorkerError,
  now: () => number,
): Promise<void> {
  await producer.send({
    dlq_version: 1,
    failed_at: new Date(now()).toISOString(),
    failure_kind: error.kind,
    error_code: error.code,
    retry_count: Math.max(0, (message.attempts ?? 1) - 1),
    envelope: message.body,
  });
  message.ack();
}
