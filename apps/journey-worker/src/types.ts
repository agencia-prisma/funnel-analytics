import type { JourneyDeadLetterEnvelopeV1 } from '@funnel/event-contracts';

import type { FunnelQueueBinding } from './funnel-publisher';

export interface JourneyDlqBinding {
  send(message: JourneyDeadLetterEnvelopeV1): Promise<void>;
}

export interface JourneyWorkerEnv {
  JOURNEY_WORKER_ENV: 'local' | 'preview' | 'production';
  JOURNEY_INACTIVITY_WINDOW_SECONDS?: string;
  CLICKHOUSE_URL: string;
  CLICKHOUSE_USERNAME: string;
  CLICKHOUSE_PASSWORD: string;
  JOURNEYS_DLQ: JourneyDlqBinding;
  FUNNELS_QUEUE: FunnelQueueBinding;
}

export interface JourneyQueueMessageLike {
  body: unknown;
  attempts?: number;
  ack(): void;
  retry(options?: { delaySeconds?: number }): void;
}

export interface JourneyQueueBatchLike {
  messages: JourneyQueueMessageLike[];
}
