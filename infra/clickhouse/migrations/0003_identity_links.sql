CREATE TABLE IF NOT EXISTS funnel_analytics.identity_links
(
  workspace_id UUID,
  person_id UUID,
  visitor_id UUID,
  pixel_id Nullable(UUID),

  source LowCardinality(String),
  confidence LowCardinality(String),

  linked_at DateTime64(3, 'UTC'),
  last_seen_at DateTime64(3, 'UTC'),

  link_version UInt64
)
ENGINE = ReplacingMergeTree(link_version)
PARTITION BY cityHash64(visitor_id) % 16
ORDER BY (
  workspace_id,
  visitor_id
);

CREATE VIEW IF NOT EXISTS funnel_analytics.identity_links_current
AS
SELECT *
FROM funnel_analytics.identity_links FINAL;

CREATE VIEW IF NOT EXISTS funnel_analytics.session_person_links
AS
SELECT
  sf.workspace_id,
  sf.pixel_id,
  sf.session_id,
  sf.visitor_id,
  il.person_id,
  sf.session_started_at,
  sf.last_activity_at,
  sf.event_count,
  sf.page_view_count,
  sf.custom_event_count,
  il.source AS identity_source,
  il.confidence AS identity_confidence,
  il.linked_at AS identity_linked_at
FROM funnel_analytics.session_facts_current sf
INNER JOIN funnel_analytics.identity_links_current il
  ON il.workspace_id = sf.workspace_id
 AND il.visitor_id = sf.visitor_id;
