import type { AttributionRecomputeEnvelopeV1 } from '@funnel/event-contracts/attribution';

import { CommerceWorkerError } from './errors';

export interface AttributionQueueBinding {
  send(message: AttributionRecomputeEnvelopeV1): Promise<void>;
}

export interface AttributionRecomputeProducer {
  send(message: AttributionRecomputeEnvelopeV1): Promise<void>;
}

export class CloudflareAttributionRecomputeProducer implements AttributionRecomputeProducer {
  constructor(private readonly queue: AttributionQueueBinding) {}

  async send(message: AttributionRecomputeEnvelopeV1): Promise<void> {
    try {
      await this.queue.send(message);
    } catch {
      throw new CommerceWorkerError(
        'TRANSIENT',
        'COMMERCE_ATTRIBUTION_PUBLISH_UNAVAILABLE',
      );
    }
  }
}
