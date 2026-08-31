CREATE TABLE IF NOT EXISTS funnel_analytics.session_facts
(
  workspace_id UUID,
  pixel_id UUID,

  session_id UUID,
  visitor_id UUID,

  session_partition_month UInt32,

  session_started_at DateTime64(3, 'UTC'),
  last_activity_at DateTime64(3, 'UTC'),
  duration_seconds UInt32,

  event_count UInt32,
  page_view_count UInt32,
  custom_event_count UInt32,

  landing_page_url Nullable(String),
  landing_page_path Nullable(String),
  landing_page_title Nullable(String),

  exit_page_url Nullable(String),
  exit_page_path Nullable(String),
  exit_page_title Nullable(String),

  session_referrer Nullable(String),
  session_referrer_domain Nullable(String),

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

  language Nullable(String),
  timezone Nullable(String),

  test_mode Bool,

  first_event_id UUID,
  last_event_id UUID,

  max_received_at DateTime64(3, 'UTC'),

  session_version UInt64,
  updated_at DateTime64(3, 'UTC')
)
ENGINE = ReplacingMergeTree(session_version)
PARTITION BY session_partition_month
ORDER BY (
  workspace_id,
  pixel_id,
  session_id
);

CREATE VIEW IF NOT EXISTS funnel_analytics.session_facts_current
AS
SELECT *
FROM funnel_analytics.session_facts FINAL;
