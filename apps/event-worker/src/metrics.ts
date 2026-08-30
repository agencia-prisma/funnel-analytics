export interface PipelineMetrics {
  events_received: number;
  events_normalized: number;
  events_written: number;
  events_retried: number;
  events_dlq: number;
  r2_failures: number;
  clickhouse_failures: number;
  processing_latency: number;
}

export function emptyMetrics(): PipelineMetrics {
  return {
    events_received: 0,
    events_normalized: 0,
    events_written: 0,
    events_retried: 0,
    events_dlq: 0,
    r2_failures: 0,
    clickhouse_failures: 0,
    processing_latency: 0,
  };
}
