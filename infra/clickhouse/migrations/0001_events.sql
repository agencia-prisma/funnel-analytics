CREATE DATABASE IF NOT EXISTS funnel_analytics;

CREATE TABLE IF NOT EXISTS funnel_analytics.events
(
  event_id UUID,
  event_version UInt16,
  event_name LowCardinality(String),
  custom_event_name Nullable(String),

  workspace_id UUID,
  pixel_id UUID,

  visitor_id UUID,
  session_id UUID,

  occurred_at DateTime64(3, 'UTC'),
  received_at DateTime64(3, 'UTC'),

  source LowCardinality(String),

  page_url String,
  page_path String,
  page_title String,
  origin_host String,

  referrer Nullable(String),
  referrer_domain Nullable(String),

  utm_source Nullable(String),
  utm_medium Nullable(String),
  utm_campaign Nullable(String),
  utm_content Nullable(String),
  utm_term Nullable(String),

  fbclid Nullable(String),
  ttclid Nullable(String),
  gclid Nullable(String),
  msclkid Nullable(String),
  tblci Nullable(String),

  device_type LowCardinality(String),
  browser_name LowCardinality(String),
  os_name LowCardinality(String),

  screen_width UInt32,
  screen_height UInt32,
  device_pixel_ratio Float32,

  viewport_width UInt32,
  viewport_height UInt32,

  language Nullable(String),
  timezone Nullable(String),

  consent_state LowCardinality(String),
  test_mode Bool,

  sdk_version LowCardinality(String),

  properties JSON,

  dedup_version UInt64
)
ENGINE = ReplacingMergeTree(dedup_version)
PARTITION BY toYYYYMM(occurred_at)
ORDER BY (
  workspace_id,
  pixel_id,
  toDate(occurred_at),
  visitor_id,
  event_id
);
