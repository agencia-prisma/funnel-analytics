import type { CommerceRecomputeEnvelopeV1 } from '@funnel/event-contracts/commerce';

export interface CommerceQueueBinding {
  send(message: CommerceRecomputeEnvelopeV1): Promise<void>;
}

export interface CommerceRecomputeProducer {
  send(message: CommerceRecomputeEnvelopeV1): Promise<void>;
}

export class CloudflareCommerceRecomputeProducer implements CommerceRecomputeProducer {
  constructor(private readonly queue: CommerceQueueBinding) {}

  async send(message: CommerceRecomputeEnvelopeV1): Promise<void> {
    await this.queue.send(message);
  }
}
