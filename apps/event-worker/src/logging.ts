export type EventWorkerLogEvent =
  | 'event_worker.batch.completed'
  | 'event_worker.batch.retry'
  | 'event_worker.message.dlq'
  | 'event_worker.raw.failed'
  | 'event_worker.clickhouse.failed'
  | 'event_worker.session_queue.failed';

export interface EventWorkerLogFields {
  queue_batch_size: number;
  envelope_count?: number;
  event_count?: number;
  workspace_id?: string;
  pixel_id?: string;
  raw_archive_ms?: number;
  clickhouse_insert_ms?: number;
  session_command_count?: number;
  processing_ms?: number;
  status: 'success' | 'retry' | 'dlq';
  retry_count?: number;
  error_code?: string;
}

export function logEventWorker(
  event: EventWorkerLogEvent,
  fields: EventWorkerLogFields,
): void {
  console.log(
    JSON.stringify({
      event,
      ...fields,
    }),
  );
}
