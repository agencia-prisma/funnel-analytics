import type {
  JourneyRecomputeEnvelopeV1,
  SessionFactV1,
} from '@funnel/event-contracts';

export interface JourneyQueueBinding {
  send(message: JourneyRecomputeEnvelopeV1): Promise<void>;
}

export interface JourneyQueueProducer {
  sendSessionUpdated(facts: SessionFactV1[], generatedAt: string): Promise<void>;
}

export class CloudflareJourneyQueueProducer implements JourneyQueueProducer {
  constructor(private readonly binding: JourneyQueueBinding) {}

  async sendSessionUpdated(
    facts: SessionFactV1[],
    generatedAt: string,
  ): Promise<void> {
    const groups = new Map<string, Set<string>>();

    for (const fact of facts) {
      const visitors = groups.get(fact.workspace_id) ?? new Set<string>();
      visitors.add(fact.visitor_id);
      groups.set(fact.workspace_id, visitors);
    }

    for (const [workspaceId, visitors] of groups) {
      const visitorIds = [...visitors].sort();
      for (let offset = 0; offset < visitorIds.length; offset += 100) {
        await this.binding.send({
          envelope_version: 1,
          request_id: crypto.randomUUID(),
          generated_at: generatedAt,
          workspace_id: workspaceId,
          reason: 'session_updated',
          visitor_ids: visitorIds.slice(offset, offset + 100),
          person_id: null,
        });
      }
    }
  }
}
