import type { SessionRecomputeEnvelopeV1 } from '@funnel/event-contracts';

import type { SessionQueueBinding } from './types';

export interface SessionRecomputeProducer {
  enqueue(envelope: SessionRecomputeEnvelopeV1): Promise<void>;
}

export class CloudflareSessionRecomputeProducer implements SessionRecomputeProducer {
  constructor(private readonly binding: SessionQueueBinding) {}

  async enqueue(envelope: SessionRecomputeEnvelopeV1): Promise<void> {
    await this.binding.send(envelope);
  }
}
