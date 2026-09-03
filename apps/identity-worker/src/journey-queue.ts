import type { JourneyRecomputeEnvelopeV1 } from '@funnel/event-contracts';

export interface JourneyQueueBinding {
  send(message: JourneyRecomputeEnvelopeV1): Promise<void>;
}

export interface JourneyQueueProducer {
  sendIdentityLinked(input: {
    workspaceId: string;
    visitorId: string;
    personId: string;
    generatedAt: string;
  }): Promise<void>;
}

export class CloudflareJourneyQueueProducer implements JourneyQueueProducer {
  constructor(private readonly binding: JourneyQueueBinding) {}

  async sendIdentityLinked(input: {
    workspaceId: string;
    visitorId: string;
    personId: string;
    generatedAt: string;
  }): Promise<void> {
    await this.binding.send({
      envelope_version: 1,
      request_id: crypto.randomUUID(),
      generated_at: input.generatedAt,
      workspace_id: input.workspaceId,
      reason: 'identity_linked',
      visitor_ids: [input.visitorId],
      person_id: input.personId,
    });
  }
}
