import type {
  CollectorEnvelopeV1,
  DeadLetterEnvelopeV1,
  SessionRecomputeEnvelopeV1,
} from '@funnel/event-contracts';

export type EventWorkerEnvironment = 'local' | 'preview' | 'production';

export interface R2ObjectBodyLike {
  text(): Promise<string>;
}

export interface R2BucketLike {
  put(
    key: string,
    value: string,
    options?: {
      httpMetadata?: {
        contentType?: string;
      };
    },
  ): Promise<unknown>;
  get(key: string): Promise<R2ObjectBodyLike | null>;
}

export interface DlqBinding {
  send(message: DeadLetterEnvelopeV1): Promise<void>;
}

export interface SessionQueueBinding {
  send(message: SessionRecomputeEnvelopeV1): Promise<void>;
}

export interface EventWorkerEnv {
  EVENT_WORKER_ENV: EventWorkerEnvironment;
  CLICKHOUSE_URL: string;
  CLICKHOUSE_USERNAME: string;
  CLICKHOUSE_PASSWORD: string;
  EVENTS_RAW_BUCKET: R2BucketLike;
  EVENTS_DLQ: DlqBinding;
  SESSIONS_QUEUE: SessionQueueBinding;
}

export interface QueueMessageLike {
  body: unknown;
  attempts?: number;
  ack(): void;
  retry(options?: { delaySeconds?: number }): void;
}

export interface QueueBatchLike {
  messages: QueueMessageLike[];
}

export interface ValidatedQueueMessage {
  message: QueueMessageLike;
  envelope: CollectorEnvelopeV1;
}
