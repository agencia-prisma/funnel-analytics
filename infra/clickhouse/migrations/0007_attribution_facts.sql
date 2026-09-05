CREATE TABLE IF NOT EXISTS funnel_analytics.attribution_facts
(
  workspace_id UUID,
  journey_id UUID,
  person_id Nullable(UUID),
  provider LowCardinality(String),
  order_id String,
  currency LowCardinality(String),
  order_status LowCardinality(String),
  attribution_model LowCardinality(String),
  touchpoint_index UInt32,
  touchpoint_count UInt32,
  session_id UUID,
  event_id UUID,
  touchpoint_at DateTime64(3, 'UTC'),
  channel LowCardinality(String),
  source String,
  medium Nullable(String),
  campaign Nullable(String),
  content Nullable(String),
  term Nullable(String),
  referrer_domain Nullable(String),
  click_id_type Nullable(String),
  click_id Nullable(String),
  is_direct Bool,
  credit_micros UInt32,
  attributed_gross_amount_minor Int64,
  attributed_refunded_amount_minor Int64,
  attributed_net_amount_minor Int64,
  test_mode Bool,
  attribution_policy_version UInt16,
  lookback_window_seconds UInt32,
  source_journey_version UInt64,
  attribution_version UInt64,
  is_deleted Bool,
  updated_at DateTime64(3, 'UTC')
)
ENGINE = ReplacingMergeTree(attribution_version, is_deleted)
PARTITION BY cityHash64(order_id) % 16
ORDER BY (
  workspace_id,
  attribution_model,
  provider,
  order_id,
  touchpoint_index
);

CREATE VIEW IF NOT EXISTS funnel_analytics.attribution_facts_current
AS
SELECT *
FROM funnel_analytics.attribution_facts FINAL;
