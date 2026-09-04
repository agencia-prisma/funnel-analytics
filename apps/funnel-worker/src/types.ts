import type { PipelineFailureKind } from '@funnel/event-contracts';
import type { FunnelRecomputeEnvelopeV1 } from '@funnel/event-contracts/funnel';

export interface FunnelDeadLetterEnvelopeV1 {
  dlq_version: 1;
  failed_at: string;
  failure_kind: PipelineFailureKind;
  error_code: string;
  retry_count: number;
  envelope: unknown;
}

export interface FunnelDlqBinding {
  send(message: FunnelDeadLetterEnvelopeV1): Promise<void>;
}

export interface FunnelWorkerEnv {
  FUNNEL_WORKER_ENV: 'local' | 'preview' | 'production';
  SUPABASE_URL: string;
  SUPABASE_SECRET_KEY: string;
  CLICKHOUSE_URL: string;
  CLICKHOUSE_USERNAME: string;
  CLICKHOUSE_PASSWORD: string;
  FUNNELS_DLQ: FunnelDlqBinding;
}

export interface FunnelQueueMessageLike {
  body: unknown;
  attempts?: number;
  ack(): void;
  retry(options?: { delaySeconds?: number }): void;
}

export interface FunnelQueueBatchLike {
  messages: FunnelQueueMessageLike[];
}

export interface ValidatedFunnelEnvelope extends FunnelRecomputeEnvelopeV1 {}
