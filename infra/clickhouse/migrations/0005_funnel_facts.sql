CREATE TABLE IF NOT EXISTS funnel_analytics.funnel_step_hits
(
  workspace_id UUID,
  funnel_id UUID,
  funnel_version_id UUID,
  funnel_version UInt32,
  journey_id UUID,
  attempt_id UUID,
  attempt_index UInt32,
  person_id Nullable(UUID),
  test_mode Bool,
  step_key LowCardinality(String),
  step_position UInt16,
  event_id UUID,
  session_id UUID,
  visitor_id UUID,
  pixel_id UUID,
  entered_at DateTime64(3, 'UTC'),
  occurred_at DateTime64(3, 'UTC'),
  elapsed_ms UInt64,
  source_journey_version UInt64,
  fact_version UInt64,
  is_deleted Bool,
  updated_at DateTime64(3, 'UTC')
)
ENGINE = ReplacingMergeTree(fact_version, is_deleted)
PARTITION BY cityHash64(journey_id) % 16
ORDER BY (
  workspace_id,
  funnel_version_id,
  journey_id,
  attempt_id,
  step_position
);

CREATE VIEW IF NOT EXISTS funnel_analytics.funnel_step_hits_current
AS
SELECT *
FROM funnel_analytics.funnel_step_hits FINAL;

CREATE TABLE IF NOT EXISTS funnel_analytics.funnel_transition_facts
(
  workspace_id UUID,
  funnel_id UUID,
  funnel_version_id UUID,
  funnel_version UInt32,
  journey_id UUID,
  attempt_id UUID,
  attempt_index UInt32,
  person_id Nullable(UUID),
  test_mode Bool,
  from_step_key LowCardinality(String),
  from_step_position UInt16,
  from_event_id UUID,
  to_step_key LowCardinality(String),
  to_step_position UInt16,
  to_event_id UUID,
  transition_ms UInt64,
  occurred_at DateTime64(3, 'UTC'),
  source_journey_version UInt64,
  fact_version UInt64,
  is_deleted Bool,
  updated_at DateTime64(3, 'UTC')
)
ENGINE = ReplacingMergeTree(fact_version, is_deleted)
PARTITION BY cityHash64(journey_id) % 16
ORDER BY (
  workspace_id,
  funnel_version_id,
  journey_id,
  attempt_id,
  to_step_position
);

CREATE VIEW IF NOT EXISTS funnel_analytics.funnel_transition_facts_current
AS
SELECT *
FROM funnel_analytics.funnel_transition_facts FINAL;

CREATE TABLE IF NOT EXISTS funnel_analytics.funnel_conversion_facts
(
  workspace_id UUID,
  funnel_id UUID,
  funnel_version_id UUID,
  funnel_version UInt32,
  journey_id UUID,
  attempt_id UUID,
  attempt_index UInt32,
  person_id Nullable(UUID),
  test_mode Bool,
  entered_event_id UUID,
  converted_event_id UUID,
  entered_at DateTime64(3, 'UTC'),
  converted_at DateTime64(3, 'UTC'),
  conversion_ms UInt64,
  step_count UInt16,
  source_journey_version UInt64,
  fact_version UInt64,
  is_deleted Bool,
  updated_at DateTime64(3, 'UTC')
)
ENGINE = ReplacingMergeTree(fact_version, is_deleted)
PARTITION BY cityHash64(journey_id) % 16
ORDER BY (
  workspace_id,
  funnel_version_id,
  journey_id,
  attempt_id
);

CREATE VIEW IF NOT EXISTS funnel_analytics.funnel_conversion_facts_current
AS
SELECT *
FROM funnel_analytics.funnel_conversion_facts FINAL;
