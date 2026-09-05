import type { PipelineFailureKind } from '@funnel/event-contracts';
import type { AttributionRecomputeEnvelopeV1 } from '@funnel/event-contracts/attribution';

export interface AttributionDeadLetterEnvelopeV1 {
  dlq_version: 1;
  failed_at: string;
  failure_kind: PipelineFailureKind;
  error_code: string;
  retry_count: number;
  envelope: unknown;
}

export interface AttributionDlqBinding {
  send(message: AttributionDeadLetterEnvelopeV1): Promise<void>;
}

export interface AttributionWorkerEnv {
  ATTRIBUTION_WORKER_ENV: 'local' | 'preview' | 'production';
  CLICKHOUSE_URL: string;
  CLICKHOUSE_USERNAME: string;
  CLICKHOUSE_PASSWORD: string;
  ATTRIBUTION_DLQ: AttributionDlqBinding;
}

export interface AttributionQueueMessageLike {
  body: unknown;
  attempts?: number;
  ack(): void;
  retry(options?: { delaySeconds?: number }): void;
}

export interface AttributionQueueBatchLike {
  messages: AttributionQueueMessageLike[];
}

export type ValidatedAttributionEnvelope = AttributionRecomputeEnvelopeV1;
