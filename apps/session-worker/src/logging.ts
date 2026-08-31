export type SessionWorkerLogEvent =
  | 'session_worker.batch.received'
  | 'session_worker.recompute.completed'
  | 'session_worker.recompute.failed'
  | 'session_worker.integrity_violation'
  | 'session_worker.dlq';

export interface SessionWorkerLogFields {
  queue_batch_size: number;
  session_count?: number;
  workspace_id?: string;
  pixel_id?: string;
  query_ms?: number;
  insert_ms?: number;
  processing_ms?: number;
  retry_count?: number;
  status: 'success' | 'retry' | 'dlq';
  error_code?: string;
}

export function logSessionWorker(
  event: SessionWorkerLogEvent,
  fields: SessionWorkerLogFields,
): void {
  console.log(
    JSON.stringify({
      event,
      ...fields,
    }),
  );
}
