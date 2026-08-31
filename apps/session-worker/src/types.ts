import type { SessionDeadLetterEnvelopeV1 } from '@funnel/event-contracts';

export type SessionWorkerEnvironment = 'local' | 'preview' | 'production';

export interface SessionDlqBinding {
  send(message: SessionDeadLetterEnvelopeV1): Promise<void>;
}

export interface SessionWorkerEnv {
  SESSION_WORKER_ENV: SessionWorkerEnvironment;
  CLICKHOUSE_URL: string;
  CLICKHOUSE_USERNAME: string;
  CLICKHOUSE_PASSWORD: string;
  SESSIONS_DLQ: SessionDlqBinding;
}

export interface SessionQueueMessageLike {
  body: unknown;
  attempts?: number;
  ack(): void;
  retry(options?: { delaySeconds?: number }): void;
}

export interface SessionQueueBatchLike {
  messages: SessionQueueMessageLike[];
}
