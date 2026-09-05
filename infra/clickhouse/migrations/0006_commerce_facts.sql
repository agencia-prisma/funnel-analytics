CREATE TABLE IF NOT EXISTS funnel_analytics.commerce_checkout_facts
(
  workspace_id UUID,
  journey_id UUID,
  person_id Nullable(UUID),
  checkout_id String,
  provider LowCardinality(String),
  currency LowCardinality(String),
  value_minor Nullable(UInt64),
  event_id UUID,
  occurred_at DateTime64(3, 'UTC'),
  test_mode Bool,
  source_journey_version UInt64,
  fact_version UInt64,
  is_deleted Bool,
  updated_at DateTime64(3, 'UTC')
)
ENGINE = ReplacingMergeTree(fact_version, is_deleted)
PARTITION BY cityHash64(journey_id) % 16
ORDER BY (workspace_id, provider, checkout_id);

CREATE VIEW IF NOT EXISTS funnel_analytics.commerce_checkout_facts_current
AS
SELECT *
FROM funnel_analytics.commerce_checkout_facts FINAL;

CREATE TABLE IF NOT EXISTS funnel_analytics.commerce_revenue_facts
(
  workspace_id UUID,
  journey_id UUID,
  person_id Nullable(UUID),
  provider LowCardinality(String),
  order_id String,
  currency LowCardinality(String),
  status LowCardinality(String),
  purchase_event_id UUID,
  purchased_at DateTime64(3, 'UTC'),
  last_event_at DateTime64(3, 'UTC'),
  gross_amount_minor UInt64,
  discount_amount_minor UInt64,
  shipping_amount_minor UInt64,
  tax_amount_minor UInt64,
  refunded_amount_minor UInt64,
  net_amount_minor Int64,
  item_count UInt32,
  quantity UInt64,
  test_mode Bool,
  source_journey_version UInt64,
  fact_version UInt64,
  is_deleted Bool,
  updated_at DateTime64(3, 'UTC')
)
ENGINE = ReplacingMergeTree(fact_version, is_deleted)
PARTITION BY cityHash64(order_id) % 16
ORDER BY (workspace_id, provider, order_id);

CREATE VIEW IF NOT EXISTS funnel_analytics.commerce_revenue_facts_current
AS
SELECT *
FROM funnel_analytics.commerce_revenue_facts FINAL;

CREATE TABLE IF NOT EXISTS funnel_analytics.commerce_item_facts
(
  workspace_id UUID,
  journey_id UUID,
  person_id Nullable(UUID),
  provider LowCardinality(String),
  order_id String,
  item_key String,
  item_id Nullable(String),
  item_name Nullable(String),
  quantity UInt64,
  unit_price_minor UInt64,
  line_total_minor UInt64,
  currency LowCardinality(String),
  test_mode Bool,
  source_journey_version UInt64,
  fact_version UInt64,
  is_deleted Bool,
  updated_at DateTime64(3, 'UTC')
)
ENGINE = ReplacingMergeTree(fact_version, is_deleted)
PARTITION BY cityHash64(order_id) % 16
ORDER BY (workspace_id, provider, order_id, item_key);

CREATE VIEW IF NOT EXISTS funnel_analytics.commerce_item_facts_current
AS
SELECT *
FROM funnel_analytics.commerce_item_facts FINAL;
