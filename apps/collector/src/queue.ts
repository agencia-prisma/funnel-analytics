import type {
  BrowserEventV1,
  CollectorEnvelopeV1,
} from '@funnel/event-contracts';

import type { QueueBinding } from './types';

export interface QueueProducer {
  enqueue(envelope: CollectorEnvelopeV1): Promise<void>;
}

export class CloudflareQueueProducer implements QueueProducer {
  constructor(private readonly binding: QueueBinding) {}

  async enqueue(envelope: CollectorEnvelopeV1): Promise<void> {
    await this.binding.send(envelope);
  }
}

export function createCollectorEnvelope(input: {
  requestId: string;
  receivedAt: string;
  collectorVersion: string;
  workspaceId: string;
  pixelId: string;
  originHost: string;
  events: BrowserEventV1[];
}): CollectorEnvelopeV1 {
  return {
    envelope_version: 1,
    request_id: input.requestId,
    received_at: input.receivedAt,
    collector_version: input.collectorVersion,
    workspace_id: input.workspaceId,
    pixel_id: input.pixelId,
    origin_host: input.originHost,
    source: 'browser',
    events: input.events,
  };
}
