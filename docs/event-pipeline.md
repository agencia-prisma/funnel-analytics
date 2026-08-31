# Event Pipeline

## Architecture

EPIC 05 adds the first persistent Data Plane pipeline:

```text
pixel.js
→ Collector
→ Cloudflare Queue
→ Event Worker
→ R2 raw archive
→ normalization
→ ClickHouse
→ Queue ack
```

Supabase remains the Control Plane. Browser events are never stored in a Supabase `public.events` table.

## Queue semantics

Cloudflare Queues are at-least-once. A message delivery is not a unique event.

The Event Worker therefore treats `event_id` as the logical event identity and assumes the same Collector envelope can be delivered more than once.

Consumer configuration:

- native batches up to 10 Queue messages;
- max retry: 3;
- dead-letter queue configured;
- no manual sleep loop;
- no ack before required persistence.

## Processing order

The mandatory order is:

```text
validate
→ archive raw
→ normalize
→ batch insert ClickHouse
→ ack
```

If R2 fails, the message is retried and is not acked.

If ClickHouse fails transiently after R2 succeeded, the message is retried. The next attempt reuses the same deterministic R2 key.

If an envelope is permanently invalid, has an unsupported envelope version, or violates the PII boundary, it is sent to the DLQ. It is acked only after the DLQ send succeeds.

## Boundary defense

`CollectorEnvelopeV1` is validated again even though it comes from the Collector.

Validated fields include:

- envelope version;
- request ID;
- received timestamp;
- Workspace ID;
- Pixel ID;
- origin host;
- source;
- event array;
- event IDs / visitor IDs / session IDs;
- event version and browser event type;
- custom properties.

PII-prohibited custom property keys are rejected again before R2/ClickHouse normal processing. Values are never logged.

## Raw archive — R2

Binding:

```text
EVENTS_RAW_BUCKET
```

R2 stores the validated Collector envelope as JSON, as close as possible to the accepted input.

Object key:

```text
events/v1/
year=YYYY/
month=MM/
day=DD/
hour=HH/
workspace=<workspace_id>/
pixel=<pixel_id>/
<request_id>.json
```

Only validated IDs and UTC time partitions enter the key. Page URLs, origins and custom properties never enter the object path.

The key is deterministic. Reprocessing the same `request_id` overwrites the same logical object rather than generating a random duplicate path.

No destructive R2 lifecycle is configured by this Epic. Retention remains a future commercial/operational decision.

## Replay

`R2RawArchive.read()` returns the validated envelope and the same `normalizeEnvelope()` function is reusable outside Queue processing.

Future replay:

```text
R2 raw
→ validate
→ normalizeEnvelope()
→ ClickHouse
```

No replay UI is implemented.

## NormalizedEventV1

Normalized events contain:

- event ID/version/name;
- custom event name;
- Workspace / Pixel;
- visitor / session;
- occurred / received timestamps;
- source;
- page and origin facts;
- referrer;
- UTMs;
- fbclid / ttclid / gclid / msclkid / tblci;
- device/browser/OS;
- screen / viewport;
- language / timezone;
- consent state;
- test mode;
- SDK version;
- flexible `properties`.

No identity resolution or PII binding is performed.

## ClickHouse

Database:

```text
funnel_analytics
```

Table:

```text
funnel_analytics.events
```

Versioned DDL:

```text
infra/clickhouse/migrations/0001_events.sql
```

The initial table uses:

- `ReplacingMergeTree(dedup_version)`;
- `PARTITION BY toYYYYMM(occurred_at)`;
- `DateTime64(3, 'UTC')`;
- UUID for event/workspace/pixel/visitor/session IDs;
- LowCardinality for stable categorical dimensions;
- native JSON for custom properties.

The sorting key begins with Workspace and Pixel, keeps date locality, then visitor/event identity. It is intentionally not partitioned by Workspace.

## ClickHouse client

The Event Worker uses the official `@clickhouse/client-web`, which is compatible with Cloudflare Workers.

Production requires HTTPS. Plain HTTP is accepted only for localhost test/development.

Inserts use `JSONEachRow` and are batched. Limits:

- max 5,000 normalized events per insert;
- max 2 MB serialized batch.

The Worker does not issue one HTTP request per event.

## Dedup strategy

Dedup has multiple layers:

### Queue retry

Queue may redeliver an envelope. Correctness never depends on exactly-once delivery.

### R2 retry

`request_id` maps to one deterministic object key.

### ClickHouse insert retry

The ClickHouse writer creates a deterministic insert deduplication token from the sorted event IDs in an insert batch.

### Logical event dedup

The table uses `ReplacingMergeTree`, with `event_id` inside the sorting key.

Background replacement is asynchronous. Therefore a correctness-sensitive query over raw events must use `FINAL` or an equivalent argMax/deduplicated representation.

Future dashboards should not blindly apply `FINAL` everywhere. Hot analytical APIs should evolve toward dedicated materialized/aggregated facts where necessary.

The pipeline never performs `SELECT event_id` before every insert.

## Partial failure

A Queue invocation can contain multiple envelopes. The Worker archives and normalizes them independently, then batches eligible normalized events into one ClickHouse insert.

If that insert fails transiently, all contributing Queue messages retry. This is safe because:

- R2 keys are idempotent;
- ClickHouse insert tokens are deterministic for identical batches;
- ReplacingMergeTree/event_id provides logical dedup across regrouped retries.

## DLQ

Binding:

```text
EVENTS_DLQ
```

Permanent invalid envelopes are explicitly sent to the DLQ.

The consumer configuration also declares the same DLQ for messages that exhaust Cloudflare Queue retry attempts.

DLQ messages include failure class/code, retry count, failure time and original envelope. They never contain infrastructure secrets.

## Observability

Structured Event Worker logs include only operational dimensions:

- Queue batch size;
- envelope count;
- event count;
- Workspace ID / Pixel ID when safe;
- raw archive latency;
- ClickHouse insert latency;
- total processing latency;
- status;
- retry count;
- error code.

Logs do not contain:

- event body;
- visitor ID;
- session ID;
- click IDs;
- raw IP;
- custom properties;
- ClickHouse credentials.

Conceptual metrics are prepared for received, normalized, written, retried, DLQ, R2 failure, ClickHouse failure and latency.

## Workspace isolation

Every ClickHouse event carries both `workspace_id` and `pixel_id`.

ClickHouse does not provide the same RLS boundary used by Supabase in this architecture. Future analytical APIs must always scope server-side queries by Workspace.

The browser never receives ClickHouse credentials and never queries ClickHouse directly.

## Local development

ClickHouse CI/local target:

```text
clickhouse/clickhouse-server:26.7.5.10
```

Cloudflare Queue and R2 use Wrangler/workerd local simulation.

The full pipeline harness in `tests/pipeline` composes the production Collector router and Event Worker consumer inside one local Worker only for acceptance. That allows one local Queue/R2 state while keeping `apps/collector` and `apps/event-worker` independently deployable.

## Acceptance

The browser acceptance proves:

```text
fixture HTML
→ real pixel.min.js
→ Collector
→ local Cloudflare Queue
→ Event Worker
→ local R2
→ local ClickHouse
```

It verifies:

- a page_view reaches ClickHouse;
- raw R2 objects exist;
- SPA landing → checkout creates two page views;
- duplicate Queue delivery yields one logical event using `FINAL`.

## Runbook

### Queue growing

Check Event Worker errors and ClickHouse/R2 health. Do not purge before determining whether messages are retryable. Inspect DLQ growth separately.

### ClickHouse unavailable

Messages must retry without ack. R2 already-written objects keep the same key. Restore ClickHouse and allow Queue delivery to resume.

### R2 unavailable

Messages must retry before normalization/ClickHouse persistence. This preserves replay guarantees.

### DLQ receiving messages

Inspect failure code and envelope metadata without exposing custom property values in logs. Permanent schema/PII failures require code or producer correction before replay.

### Duplicate events

Check whether queries use the raw table without logical deduplication. Use `FINAL` for correctness investigations and verify insert dedup tokens/event IDs.

### Schema migration failure

Stop before deployment. ClickHouse migrations are immutable after Production application. Fix with a new migration rather than editing an applied migration.

## Production provisioning

EPIC 05 does not provision Production infrastructure.

Production will require, when approved:

- Event Worker deployment;
- Queue consumer attached to the Collector production Queue;
- Production DLQ;
- Production R2 raw bucket;
- ClickHouse Cloud service;
- `CLICKHOUSE_URL`;
- `CLICKHOUSE_USERNAME`;
- `CLICKHOUSE_PASSWORD`;
- explicit execution of ClickHouse migrations.

No Supabase migration is required by EPIC 05.
