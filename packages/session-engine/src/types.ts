import type { DeviceTypeV1, SessionFactV1 } from '@funnel/event-contracts';

export interface SessionQueryGroup {
  workspace_id: string;
  pixel_id: string;
  session_ids: string[];
}

export interface SessionAggregateRow {
  workspace_id: string;
  pixel_id: string;
  session_id: string;
  visitor_id: string;
  visitor_count: number | string;
  test_mode_count: number | string;
  session_started_at_ms: number | string;
  last_activity_at_ms: number | string;
  max_received_at_ms: number | string;
  event_count: number | string;
  page_view_count: number | string;
  custom_event_count: number | string;
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
  test_mode: boolean | number | string;
  first_event_id: string;
  last_event_id: string;
}

export interface SessionRepository {
  recomputeGroup(group: SessionQueryGroup): Promise<SessionFactV1[]>;
  insertSnapshots(facts: SessionFactV1[]): Promise<void>;
}
