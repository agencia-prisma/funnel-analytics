# Attribution Engine

EPIC 12 introduces deterministic revenue attribution downstream of Commerce.

## Goal

Transform current Journey + Commerce state into queryable marketing-credit facts without rewriting raw events, sessions, journeys or orders.

The V1 pipeline is:

```text
Collector → Event Worker → Session Worker → Journey Worker
                                      ↓
                                Commerce Queue
                                      ↓
                                Commerce Worker
                                      ↓
                              Attribution Queue
                                      ↓
                             Attribution Worker
                                      ↓
                         ClickHouse attribution_facts
```

Commerce remains the source of truth for orders, refunds and net revenue. Attribution only allocates credit over those current Commerce facts.

## Models V1

The pure `@funnel/attribution-engine` evaluates four models for every current order:

- `first_touch`: 100% to the first eligible Journey acquisition touchpoint;
- `last_touch`: 100% to the last eligible touchpoint at or before purchase;
- `last_non_direct`: 100% to the latest non-direct touchpoint, falling back to the latest direct touch when no non-direct touch exists;
- `linear`: equal credit across all eligible session acquisition touchpoints.

Every model is materialized independently, so dashboards can compare models without recomputing historical raw events at query time.

## Touchpoint policy

V1 creates at most one acquisition touchpoint per Session inside the current Journey.

Events are ordered deterministically by `occurred_at`, `received_at`, then `event_id`. For each Session, the first event carrying a marketing signal is selected. If no event in that Session carries a marketing signal, the earliest event becomes a direct touchpoint.

Marketing signals are:

- UTM source/medium/campaign/content/term;
- `gclid`, `msclkid`, `fbclid`, `ttclid`, `tblci`;
- external referrer domain.

The purchase source event must exist inside the current Journey input. Missing source state is treated as an integrity violation instead of silently inventing attribution.

## Attribution window

Attribution inherits the Journey policy window. The Attribution Worker reads `inactivity_window_seconds` from the current Journey fact and passes that exact value to the pure engine as the purchase lookback window.

This keeps Journey construction and attribution lookback aligned today while leaving the engine API ready for a future Workspace-specific attribution policy provider.

## Channel normalization

Explicit UTM source/medium takes precedence. When UTMs are absent, V1 uses deterministic fallbacks:

- `gclid` → `google / cpc` → `paid_search`;
- `msclkid` → `microsoft / cpc` → `paid_search`;
- `fbclid` → `meta / paid_social` → `paid_social`;
- `ttclid` → `tiktok / paid_social` → `paid_social`;
- `tblci` → `taboola / native` → `native`;
- referrer domain → `<domain> / referral` → `referral`;
- no marketing signal → `direct`.

Known UTM media additionally normalize into `paid_search`, `paid_social`, `display`, `native`, `affiliate`, `email`, `organic_search`, `organic_social`, `referral`, `direct` or `other`.

Raw campaign/content/term and the selected click ID are preserved in the attribution fact. Click IDs are marketing identifiers, not buyer PII.

## Exact money allocation

Money remains integer minor units. Attribution never uses floating-point currency.

Each model allocates:

- gross amount;
- refunded amount;
- net amount.

Credit uses integer millionths (`credit_micros`) where 1,000,000 = 100%.

For `linear`, integer division remainder is assigned deterministically from the earliest selected touchpoint forward. Therefore, for every order/model:

- sum of `credit_micros` = 1,000,000;
- sum of attributed gross = Commerce gross;
- sum of attributed refunded = Commerce refunded;
- sum of attributed net = Commerce net.

Refunds automatically change attributed net revenue on the next Commerce recompute.

## ClickHouse storage

Migration `0007_attribution_facts.sql` adds:

- `attribution_facts`;
- `attribution_facts_current`.

Logical key:

`workspace_id + attribution_model + provider + order_id + touchpoint_index`

The key intentionally excludes `journey_id`. If late identity reconstructs a purchase into a different Journey, old Journey facts can be tombstoned and the order can be re-materialized without double-counting current revenue attribution.

Facts include opaque Workspace/Journey/Person/Session/Event references, order/provider/currency/status, model, marketing dimensions, credit and attributed money.

Versioning follows the existing downstream-fact convention:

- tombstone version = `2 * source_journey_version`;
- active version = `2 * source_journey_version + 1`.

`ReplacingMergeTree(attribution_version, is_deleted)` plus the `FINAL` current view makes duplicate Queue delivery logically idempotent.

## Queue contract

`AttributionRecomputeEnvelopeV1` contains:

- Workspace ID;
- current Journey IDs;
- deleted Journey IDs;
- source Journey version;
- generated/request metadata;
- reason `commerce_recomputed`.

Maximum current + deleted Journey references per envelope is 100.

## ACK and retry ordering

Commerce Worker write order becomes:

1. tombstone stale Commerce facts;
2. recompute current Commerce facts;
3. persist current checkout/revenue/item facts;
4. publish Attribution recompute;
5. ACK the Commerce message.

If Attribution Queue publication fails, Commerce retries. Commerce persistence is already idempotent, so this does not duplicate current orders.

Attribution Worker:

1. validates the envelope;
2. tombstones deleted Journey attribution;
3. reads current Journey policy, current Commerce revenue facts and canonical Journey events;
4. evaluates all V1 models;
5. replaces current Journey attribution facts;
6. ACKs.

Transient ClickHouse/network failures retry. Invalid envelopes, invalid Commerce money and missing purchase source events go to Attribution DLQ as permanent integrity failures.

## Production resources planned

- Worker: `funnel-analytics-attribution-worker-production`
- Queue: `funnel-analytics-attribution-production`
- DLQ: `funnel-analytics-attribution-dlq-production`
- Commerce binding: `ATTRIBUTION_QUEUE`
- Attribution binding: `ATTRIBUTION_DLQ`

The Attribution Worker needs only:

- `CLICKHOUSE_URL`
- `CLICKHOUSE_USERNAME`
- `CLICKHOUSE_PASSWORD`

No Supabase secret is required.

## PII

Attribution does not consume buyer email, phone, CPF, name, ciphertext or blind indexes. `person_id` is an opaque analytics reference. Marketing click IDs and UTMs are retained because they are acquisition dimensions required for attribution.

## Metrics unlocked

V1 facts make the following queryable by attribution model:

- attributed gross revenue;
- attributed refunded revenue;
- attributed net revenue;
- orders and revenue by channel;
- source / medium / campaign / content / term performance;
- click-ID-backed paid acquisition performance;
- first-touch versus last-touch versus last-non-direct versus linear comparison;
- revenue by Journey and Person where a Person exists.

## Out of scope for EPIC 12

- Meta Ads / TikTok Ads / Google Ads API cost ingestion;
- campaign/ad/adset metadata synchronization;
- ROAS and CAC cost joins;
- probabilistic attribution;
- view-through attribution;
- cross-device modeling beyond the existing Person/Journey identity layer;
- configurable attribution-model UI;
- dashboard/query API;
- Funnel Builder UI.

Those layers can consume the deterministic attribution facts introduced here.
