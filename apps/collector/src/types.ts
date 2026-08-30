import type { CollectorEnvelopeV1 } from '@funnel/event-contracts';

export type CollectorEnvironment = 'local' | 'preview' | 'production';

export interface QueueBinding {
  send(message: CollectorEnvelopeV1): Promise<void>;
}

export interface RateLimitBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface CollectorEnv {
  COLLECTOR_ENV: CollectorEnvironment;
  SUPABASE_URL?: string;
  SUPABASE_SECRET_KEY?: string;
  LOCAL_PIXEL_REGISTRY_JSON?: string;
  EVENTS_QUEUE: QueueBinding;
  EVENTS_RATE_LIMITER: RateLimitBinding;
}

export interface ExecutionContextLike {
  waitUntil(promise: Promise<unknown>): void;
}

export interface QueueMessageLike {
  ack(): void;
}

export interface QueueBatchLike {
  messages: QueueMessageLike[];
}
