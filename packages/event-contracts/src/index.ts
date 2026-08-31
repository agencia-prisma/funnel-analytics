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

export const EVENT_BATCH_V1_MAX_EVENTS = 20;
export const EVENT_BATCH_V1_MAX_BODY_BYTES = 128 * 1024;

export type ConsentStateV1 = 'unknown' | 'granted' | 'denied';
export type DeviceTypeV1 = 'mobile' | 'tablet' | 'desktop' | 'unknown';

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface BrowserEventBaseV1 {
  event_id: string;
  event_name: 'page_view' | 'custom_event';
  event_version: 1;
  sdk_version: string;

  pixel_key: string;

  visitor_id: string;
  session_id: string;

  occurred_at: string;

  page_url: string;
  page_path: string;
  page_title: string;

  referrer: string | null;
  referrer_domain: string | null;

  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;

  click_ids: Record<string, string>;

  device: {
    type: DeviceTypeV1;
  };
  browser: {
    name: string;
  };
  os: {
    name: string;
  };

  screen: {
    width: number;
    height: number;
    device_pixel_ratio: number;
  };
  viewport: {
    width: number;
    height: number;
  };

  language: string | null;
  timezone: string | null;

  consent_state: ConsentStateV1;
  test_mode: boolean;
}

export interface PageViewEventV1 extends BrowserEventBaseV1 {
  event_name: 'page_view';
}

export interface CustomEventV1 extends BrowserEventBaseV1 {
  event_name: 'custom_event';
  custom_event_name: string;
  properties: Record<string, JsonValue>;
}

export type BrowserEventV1 = PageViewEventV1 | CustomEventV1;

export interface EventBatchV1 {
  batch_version: 1;
  sent_at: string;
  events: BrowserEventV1[];
}

export interface CollectorEnvelopeV1 {
  envelope_version: 1;
  request_id: string;
  received_at: string;
  collector_version: string;
  workspace_id: string;
  pixel_id: string;
  origin_host: string;
  source: 'browser';
  events: BrowserEventV1[];
}

export interface NormalizedEventV1 {
  event_id: string;
  event_version: 1;
  event_name: string;
  custom_event_name: string | null;

  workspace_id: string;
  pixel_id: string;

  visitor_id: string;
  session_id: string;

  occurred_at: string;
  received_at: string;

  source: string;

  page_url: string;
  page_path: string;
  page_title: string;

  origin_host: string;

  referrer: string | null;
  referrer_domain: string | null;

  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;

  fbclid: string | null;
  ttclid: string | null;
  gclid: string | null;
  msclkid: string | null;
  tblci: string | null;

  device_type: DeviceTypeV1;
  browser_name: string;
  os_name: string;

  screen_width: number;
  screen_height: number;
  device_pixel_ratio: number;

  viewport_width: number;
  viewport_height: number;

  language: string | null;
  timezone: string | null;

  consent_state: ConsentStateV1;
  test_mode: boolean;

  sdk_version: string;

  properties: Record<string, JsonValue>;
}

export type PipelineFailureKind = 'PERMANENT' | 'TRANSIENT';

export interface DeadLetterEnvelopeV1 {
  dlq_version: 1;
  failed_at: string;
  failure_kind: PipelineFailureKind;
  error_code: string;
  retry_count: number;
  envelope: unknown;
}

export const SESSION_RECOMPUTE_V1_MAX_SESSION_IDS = 100;

export interface SessionRecomputeEnvelopeV1 {
  envelope_version: 1;
  request_id: string;
  generated_at: string;
  workspace_id: string;
  pixel_id: string;
  session_ids: string[];
}

export interface SessionDeadLetterEnvelopeV1 {
  dlq_version: 1;
  failed_at: string;
  failure_kind: PipelineFailureKind;
  error_code: string;
  retry_count: number;
  envelope: unknown;
}

export interface SessionFactV1 {
  workspace_id: string;
  pixel_id: string;
  session_id: string;
  visitor_id: string;
  session_partition_month: number;
  session_started_at: string;
  last_activity_at: string;
  duration_seconds: number;
  event_count: number;
  page_view_count: number;
  custom_event_count: number;
  landing_page_url: string | null;
  landing_page_path: string | null;
  landing_page_title: string | null;
  exit_page_url: string | null;
  exit_page_path: string | null;
  exit_page_title: string | null;
  session_referrer: string | null;
  session_referrer_domain: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  fbclid: string | null;
  ttclid: string | null;
  gclid: string | null;
  msclkid: string | null;
  tblci: string | null;
  device_type: DeviceTypeV1;
  browser_name: string;
  os_name: string;
  language: string | null;
  timezone: string | null;
  test_mode: boolean;
  first_event_id: string;
  last_event_id: string;
  max_received_at: string;
  session_version: string;
  updated_at: string;
}
