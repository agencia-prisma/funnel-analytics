export type IdentityWorkerLogEvent =
  | 'identity.worker.resolved'
  | 'identity.worker.created_person'
  | 'identity.worker.conflict'
  | 'identity.worker.retry'
  | 'identity.worker.dlq';

export interface IdentityWorkerLogFields {
  queue_batch_size: number;
  workspace_id?: string;
  pixel_id?: string;
  identifier_count?: number;
  identifier_types?: string[];
  processing_ms?: number;
  control_plane_ms?: number;
  clickhouse_ms?: number;
  retry_count?: number;
  status: 'success' | 'retry' | 'dlq';
  error_code?: string;
}

export function logIdentityWorker(
  event: IdentityWorkerLogEvent,
  fields: IdentityWorkerLogFields,
): void {
  console.log(JSON.stringify({ event, ...fields }));
}
