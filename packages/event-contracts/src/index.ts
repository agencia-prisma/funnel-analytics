export interface HealthEvent {
  service: string;
  status: 'ok';
  timestamp: string;
  version: string;
}

export interface EventEnvelope<TPayload = unknown> {
  event_id: string;
  event_name: string;
  occurred_at: string;
  payload: TPayload;
  schema_version: string;
}
