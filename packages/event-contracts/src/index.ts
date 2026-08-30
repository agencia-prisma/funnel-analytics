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
