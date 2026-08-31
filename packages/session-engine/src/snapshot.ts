import type { SessionFactV1 } from '@funnel/event-contracts';

import { SessionEngineError } from './errors';
import type { SessionAggregateRow } from './types';
import {
  createSessionVersion,
  isoFromEpochMs,
  sessionPartitionMonthFromUuidV7,
} from './version';

function toSafeNumber(value: number | string): number {
  const parsed = typeof value === 'number' ? value : Number(value);

  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new SessionEngineError('PERMANENT', 'SESSION_INTEGRITY_VIOLATION');
  }

  return parsed;
}

function toBoolean(value: boolean | number | string): boolean {
  if (value === true || value === 1 || value === '1' || value === 'true') {
    return true;
  }

  if (value === false || value === 0 || value === '0' || value === 'false') {
    return false;
  }

  throw new SessionEngineError('PERMANENT', 'SESSION_INTEGRITY_VIOLATION');
}

export function snapshotFromAggregate(row: SessionAggregateRow): SessionFactV1 {
  const visitorCount = toSafeNumber(row.visitor_count);
  const testModeCount = toSafeNumber(row.test_mode_count);
  const eventCount = toSafeNumber(row.event_count);
  const pageViewCount = toSafeNumber(row.page_view_count);
  const customEventCount = toSafeNumber(row.custom_event_count);
  const startedAtMs = toSafeNumber(row.session_started_at_ms);
  const lastActivityAtMs = toSafeNumber(row.last_activity_at_ms);
  const maxReceivedAtMs = toSafeNumber(row.max_received_at_ms);

  if (
    visitorCount !== 1 ||
    testModeCount !== 1 ||
    eventCount === 0 ||
    pageViewCount + customEventCount !== eventCount ||
    lastActivityAtMs < startedAtMs
  ) {
    throw new SessionEngineError('PERMANENT', 'SESSION_INTEGRITY_VIOLATION');
  }

  const hasPageView = pageViewCount > 0;
  const maxReceivedAt = isoFromEpochMs(maxReceivedAtMs);

  return {
    workspace_id: row.workspace_id,
    pixel_id: row.pixel_id,
    session_id: row.session_id,
    visitor_id: row.visitor_id,
    session_partition_month: sessionPartitionMonthFromUuidV7(row.session_id),
    session_started_at: isoFromEpochMs(startedAtMs),
    last_activity_at: isoFromEpochMs(lastActivityAtMs),
    duration_seconds: Math.max(
      0,
      Math.floor((lastActivityAtMs - startedAtMs) / 1_000),
    ),
    event_count: eventCount,
    page_view_count: pageViewCount,
    custom_event_count: customEventCount,
    landing_page_url: hasPageView ? row.landing_page_url : null,
    landing_page_path: hasPageView ? row.landing_page_path : null,
    landing_page_title: hasPageView ? row.landing_page_title : null,
    exit_page_url: hasPageView ? row.exit_page_url : null,
    exit_page_path: hasPageView ? row.exit_page_path : null,
    exit_page_title: hasPageView ? row.exit_page_title : null,
    session_referrer: row.session_referrer,
    session_referrer_domain: row.session_referrer_domain,
    utm_source: row.utm_source,
    utm_medium: row.utm_medium,
    utm_campaign: row.utm_campaign,
    utm_content: row.utm_content,
    utm_term: row.utm_term,
    fbclid: row.fbclid,
    ttclid: row.ttclid,
    gclid: row.gclid,
    msclkid: row.msclkid,
    tblci: row.tblci,
    device_type: row.device_type,
    browser_name: row.browser_name,
    os_name: row.os_name,
    language: row.language,
    timezone: row.timezone,
    test_mode: toBoolean(row.test_mode),
    first_event_id: row.first_event_id,
    last_event_id: row.last_event_id,
    max_received_at: maxReceivedAt,
    session_version: createSessionVersion(maxReceivedAtMs, eventCount),
    updated_at: maxReceivedAt,
  };
}
