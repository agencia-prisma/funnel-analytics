import type { IdentityEnvelopeV1 } from '@funnel/event-contracts';

import type { IdentityQueueBinding } from './types';

export interface IdentityQueueProducer {
  enqueue(envelope: IdentityEnvelopeV1): Promise<void>;
}

export class CloudflareIdentityQueueProducer
  implements IdentityQueueProducer
{
  constructor(private readonly binding: IdentityQueueBinding) {}

  async enqueue(envelope: IdentityEnvelopeV1): Promise<void> {
    await this.binding.send(envelope);
  }
}
