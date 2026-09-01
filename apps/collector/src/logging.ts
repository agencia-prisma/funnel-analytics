export type CollectorLogEvent =
  | 'collector.request.accepted'
  | 'collector.request.rejected'
  | 'collector.pixel.invalid'
  | 'collector.origin.rejected'
  | 'collector.rate_limited'
  | 'collector.queue.failed'
  | 'collector.control_plane.failed'
  | 'identity.request.accepted'
  | 'identity.request.rejected'
  | 'identity.request.rate_limited'
  | 'identity.queue.failed';

export interface CollectorLogFields {
  request_id: string;
  workspace_id?: string;
  pixel_id?: string;
  origin_host?: string;
  event_count?: number;
  identifier_count?: number;
  identifier_types?: string[];
  status_code?: number;
  latency_ms?: number;
  queue_latency_ms?: number;
  error_code?: string;
}

export function logCollector(
  event: CollectorLogEvent,
  fields: CollectorLogFields,
): void {
  console.log(
    JSON.stringify({
      event,
      ...fields,
    }),
  );
}
