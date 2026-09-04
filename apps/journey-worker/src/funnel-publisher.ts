import type { FunnelRecomputeEnvelopeV1 } from '@funnel/event-contracts/funnel';

export interface FunnelQueueBinding {
  send(message: FunnelRecomputeEnvelopeV1): Promise<void>;
}

export interface FunnelRecomputeProducer {
  send(message: FunnelRecomputeEnvelopeV1): Promise<void>;
}

export class CloudflareFunnelRecomputeProducer
  implements FunnelRecomputeProducer
{
  constructor(private readonly queue: FunnelQueueBinding) {}

  async send(message: FunnelRecomputeEnvelopeV1): Promise<void> {
    await this.queue.send(message);
  }
}
