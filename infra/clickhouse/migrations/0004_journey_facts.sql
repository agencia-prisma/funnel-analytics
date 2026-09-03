CREATE TABLE IF NOT EXISTS funnel_analytics.journey_facts
(
  workspace_id UUID,
  journey_id UUID,
  subject_kind LowCardinality(String),
  subject_id UUID,
  person_id Nullable(UUID),
  test_mode Bool,
  policy_version UInt16,
  inactivity_window_seconds UInt32,
  journey_started_at DateTime64(3, 'UTC'),
  last_activity_at DateTime64(3, 'UTC'),
  duration_seconds UInt64,
  session_count UInt32,
  visitor_count UInt32,
  pixel_count UInt32,
  event_count UInt64,
  page_view_count UInt64,
  custom_event_count UInt64,
  first_session_id UUID,
  last_session_id UUID,
  first_pixel_id UUID,
  last_pixel_id UUID,
  landing_page_url Nullable(String),
  landing_page_path Nullable(String),
  landing_page_title Nullable(String),
  exit_page_url Nullable(String),
  exit_page_path Nullable(String),
  exit_page_title Nullable(String),
  first_referrer Nullable(String),
  first_referrer_domain Nullable(String),
  first_utm_source Nullable(String),
  first_utm_medium Nullable(String),
  first_utm_campaign Nullable(String),
  first_utm_content Nullable(String),
  first_utm_term Nullable(String),
  last_utm_source Nullable(String),
  last_utm_medium Nullable(String),
  last_utm_campaign Nullable(String),
  last_utm_content Nullable(String),
  last_utm_term Nullable(String),
  first_fbclid Nullable(String),
  first_ttclid Nullable(String),
  first_gclid Nullable(String),
  first_msclkid Nullable(String),
  first_tblci Nullable(String),
  last_fbclid Nullable(String),
  last_ttclid Nullable(String),
  last_gclid Nullable(String),
  last_msclkid Nullable(String),
  last_tblci Nullable(String),
  max_session_version UInt64,
  max_identity_link_version UInt64,
  journey_version UInt64,
  is_deleted Bool,
  updated_at DateTime64(3, 'UTC')
)
ENGINE = ReplacingMergeTree(journey_version, is_deleted)
PARTITION BY cityHash64(journey_id) % 16
ORDER BY (workspace_id, journey_id);

CREATE VIEW IF NOT EXISTS funnel_analytics.journey_facts_current
AS
SELECT *
FROM funnel_analytics.journey_facts FINAL;

CREATE TABLE IF NOT EXISTS funnel_analytics.journey_session_links
(
  workspace_id UUID,
  session_id UUID,
  journey_id UUID,
  visitor_id UUID,
  person_id Nullable(UUID),
  pixel_id UUID,
  test_mode Bool,
  sequence_index UInt32,
  session_started_at DateTime64(3, 'UTC'),
  journey_version UInt64,
  is_deleted Bool,
  updated_at DateTime64(3, 'UTC')
)
ENGINE = ReplacingMergeTree(journey_version, is_deleted)
PARTITION BY cityHash64(session_id) % 16
ORDER BY (workspace_id, session_id);

CREATE VIEW IF NOT EXISTS funnel_analytics.journey_session_links_current
AS
SELECT *
FROM funnel_analytics.journey_session_links FINAL;
