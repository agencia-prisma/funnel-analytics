import type { PipelineFailureKind } from '@funnel/event-contracts';
import type { CommerceRecomputeEnvelopeV1 } from '@funnel/event-contracts/commerce';

export interface CommerceDeadLetterEnvelopeV1 {
  dlq_version: 1;
  failed_at: string;
  failure_kind: PipelineFailureKind;
  error_code: string;
  retry_count: number;
  envelope: unknown;
}

export interface CommerceDlqBinding {
  send(message: CommerceDeadLetterEnvelopeV1): Promise<void>;
}

export interface CommerceWorkerEnv {
  COMMERCE_WORKER_ENV: 'local' | 'preview' | 'production';
  CLICKHOUSE_URL: string;
  CLICKHOUSE_USERNAME: string;
  CLICKHOUSE_PASSWORD: string;
  COMMERCE_DLQ: CommerceDlqBinding;
}

export interface CommerceQueueMessageLike {
  body: unknown;
  attempts?: number;
  ack(): void;
  retry(options?: { delaySeconds?: number }): void;
}

export interface CommerceQueueBatchLike {
  messages: CommerceQueueMessageLike[];
}

export type ValidatedCommerceEnvelope = CommerceRecomputeEnvelopeV1;
