import type {
  IdentityDeadLetterEnvelopeV1,
  IdentityEnvelopeV1,
  JourneyRecomputeEnvelopeV1,
} from '@funnel/event-contracts';

export type IdentityWorkerEnvironment = 'local' | 'preview' | 'production';

export interface IdentityJourneyQueueBinding {
  send(message: JourneyRecomputeEnvelopeV1): Promise<void>;
}

export interface IdentityDlqBinding {
  send(message: IdentityDeadLetterEnvelopeV1): Promise<void>;
}

export interface IdentityWorkerEnv {
  IDENTITY_WORKER_ENV: IdentityWorkerEnvironment;
  SUPABASE_URL: string;
  SUPABASE_SECRET_KEY: string;
  CLICKHOUSE_URL: string;
  CLICKHOUSE_USERNAME: string;
  CLICKHOUSE_PASSWORD: string;
  IDENTITY_DLQ: IdentityDlqBinding;
  JOURNEYS_QUEUE: IdentityJourneyQueueBinding;
}

export interface IdentityQueueMessageLike {
  body: unknown;
  attempts?: number;
  ack(): void;
  retry(options?: { delaySeconds?: number }): void;
}

export interface IdentityQueueBatchLike {
  messages: IdentityQueueMessageLike[];
}

export interface ValidatedIdentityMessage {
  message: IdentityQueueMessageLike;
  envelope: IdentityEnvelopeV1;
}
