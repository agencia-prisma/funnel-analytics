# Sessionization

## Purpose

EPIC 06 introduces the first analytical layer derived from canonical events.

```text
funnel_analytics.events
  ↓
affected session references
  ↓
SESSIONS_QUEUE
  ↓
Session Worker
  ↓
recompute from canonical events
  ↓
funnel_analytics.session_facts
```

Supabase remains the Control Plane. No session facts are stored in PostgreSQL.

## Browser session identity

For browser V1, the SDK-generated `session_id` is the primary session identity.

The existing browser SDK applies a 30-minute inactivity timeout. The backend does not invent or arbitrarily recalculate browser session IDs. It consolidates a recomputable snapshot for the session ID already present on events.

This keeps the backend compatible with late events, retries and replay while leaving room for future server/webhook/API sources to use another reconciliation strategy.

## Delivery guarantee

The Event Worker publishes session recompute commands only after raw archive and canonical event persistence have succeeded.

Required order:

```text
R2 OK
→ ClickHouse events OK
→ SESSIONS_QUEUE.send() OK
→ ack EVENTS_QUEUE
```

If `SESSIONS_QUEUE` fails, the original event Queue message is not acknowledged and is retried. Existing R2 and ClickHouse idempotency make this safe.

## Session recompute envelope

`SessionRecomputeEnvelopeV1` contains only references:

- envelope version;
- request ID;
- generated timestamp;
- Workspace ID;
- Pixel ID;
- unique session IDs.

It never republishes complete event bodies.

A message is limited to 100 session IDs. IDs are deduplicated within a Workspace/Pixel group and split into additional commands when necessary.

## Queue semantics

`SESSIONS_QUEUE` is at-least-once.

The same session may be recomputed repeatedly. Correctness therefore never depends on a single delivery or an in-memory lock.

The Session Worker consumer is configured for batches and native Cloudflare retry/DLQ handling. No long manual sleep loop is used.

## Recompute model

Session facts are full snapshots, not counters.

The Worker does **not** maintain facts using operations such as `event_count += 1`. That would be incorrect under retries, duplicate event delivery, late events, replay and out-of-order arrival.

Instead:

```text
affected session
→ query canonical events
→ calculate complete facts again
→ write new snapshot
```

The recomputation function is independent of Queue transport, so a future replay/backfill path can call the same repository/engine.

## Canonical events query

Session recomputation uses:

```sql
FROM funnel_analytics.events FINAL
WHERE workspace_id = {workspace_id:UUID}
  AND pixel_id = {pixel_id:UUID}
  AND session_id IN {session_ids:Array(UUID)}
```

`FINAL` is intentionally limited to the affected sessions. It provides V1 correctness over the ReplacingMergeTree raw event table without scanning the entire event dataset.

All Queue-derived values use ClickHouse query parameters. Session IDs are never concatenated directly into SQL.

A Session Worker invocation accepts at most 500 session references. Queries are grouped by Workspace + Pixel and executed in chunks of at most 100 session IDs. There is no one-query-per-session N+1 path.

## Event ordering

Analytical ordering uses the deterministic tuple:

```text
occurred_at
received_at
event_id
```

`occurred_at` is primary. `received_at` and `event_id` are only deterministic tie breakers.

This allows a late or out-of-order event to correct a previously written session snapshot.

## Session facts

ClickHouse table:

```text
funnel_analytics.session_facts
```

Current-view helper:

```text
funnel_analytics.session_facts_current
```

The snapshot contains:

- Workspace / Pixel;
- session / visitor;
- session start and last activity;
- duration;
- event/page/custom-event counts;
- landing page and exit page;
- first-event referrer and acquisition facts;
- click IDs;
- first-event device/browser/OS/language/timezone;
- test mode;
- first/last event IDs;
- maximum received timestamp;
- deterministic session version;
- deterministic updated timestamp.

Landing and exit are nullable because a future-compatible session may contain only non-page-view events.

## Session start, end and duration

`session_started_at` is the minimum canonical `occurred_at`.

`last_activity_at` is the maximum canonical `occurred_at`.

`duration_seconds` is the non-negative difference between them. A one-event session has duration zero.

## Counts

`event_count` counts canonical logical events.

`page_view_count` counts `event_name = 'page_view'`.

The event pipeline currently stores custom-event analytical names in `event_name` and preserves the original custom-event marker in `custom_event_name`. Therefore `custom_event_count` uses `custom_event_name IS NOT NULL`.

## Landing and exit

Landing is the first page view using `argMinIf` over the deterministic event ordering tuple.

Exit is the latest known page view using `argMaxIf` over the same ordering.

A late event can update counts or duration without disturbing landing/exit when it belongs between existing page views. A later page view correctly becomes the new exit.

## Session acquisition facts

This Epic does not implement global attribution models.

The session snapshot preserves only factual context from the first event:

- referrer / referrer domain;
- UTMs;
- fbclid / ttclid / gclid / msclkid / tblci;
- device type;
- browser;
- OS;
- language;
- timezone.

No First Touch global, Last Touch, Last Non-Direct or Journey attribution model is calculated.

## Integrity validation

A browser session is expected to be internally consistent.

The engine rejects a snapshot as `SESSION_INTEGRITY_VIOLATION` when:

- one Workspace/Pixel/session group contains more than one visitor ID;
- a session mixes test and non-test events;
- counts are internally impossible;
- timestamps would make duration negative;
- the session identity cannot be interpreted safely.

Permanent integrity failures go to the Sessions DLQ and are not silently coerced.

The logical key is always:

```text
workspace_id
+ pixel_id
+ session_id
```

The same theoretical session ID in another Workspace or Pixel is a different analytical session.

## Session version

`session_facts` is a complete recomputable snapshot.

The version is deterministic:

```text
max_received_at_ms * 1,000,000 + event_count
```

The event-count range is bounded before encoding.

Identical retries produce the same version. A newly received late event changes `max_received_at` and/or the canonical count, producing a newer snapshot. `Date.now()` is never used as snapshot version.

`updated_at` is also deterministic and equals the canonical maximum received timestamp.

## ReplacingMergeTree design

`session_facts` uses:

```text
ReplacingMergeTree(session_version)
```

with stable replacement key:

```text
ORDER BY (
  workspace_id,
  pixel_id,
  session_id
)
```

A mutable field such as `session_started_at` is deliberately **not** included in the sorting key. A late earlier event can change the calculated start time, and a mutable replacement key would prevent the old and new snapshot from replacing one another.

### Partitioning

The table stores `session_partition_month`, derived from the timestamp embedded in the browser UUIDv7 session identity. This gives the snapshot a stable month even when a late event changes the calculated `session_started_at`.

The table partitions by `session_partition_month`, never by Workspace.

This is a deliberate correctness-oriented refinement of the conceptual `toYYYYMM(session_started_at)` suggestion.

## Current snapshot query

V1 correctness uses:

```text
session_facts FINAL
```

The helper view `funnel_analytics.session_facts_current` exposes that path.

Old physical snapshot versions must never be summed directly. Queries over the raw table that calculate totals must first select the current logical snapshot.

## Session Worker failures

Transient examples:

- ClickHouse 5xx;
- network failure;
- timeout;
- temporary missing canonical events caused by asynchronous pipeline timing.

Transient errors cause Queue retry without ack.

Permanent examples:

- invalid session envelope;
- unsupported version;
- session integrity violation;
- permanent ClickHouse schema/auth error;
- unbounded session batch.

Permanent errors are sent to `SESSIONS_DLQ`; the Queue message is acknowledged only after the DLQ send succeeds.

## Observability

Allowed structured operational fields include:

- Queue batch size;
- session count;
- Workspace ID when required;
- Pixel ID;
- query latency;
- insert latency;
- processing latency;
- retry count;
- status;
- error code.

Operational logs do **not** include:

- session ID;
- visitor ID;
- page URL;
- UTM values;
- click IDs;
- PII;
- raw IP;
- ClickHouse credentials.

Prepared conceptual metrics:

- sessions_recomputed;
- sessions_written;
- session_retries;
- session_dlq;
- session_integrity_failures;
- session_query_latency;
- session_insert_latency.

## Security and data minimization

No new identity data is introduced.

The session layer does not persist email, phone, CPF or name. It uses only the pseudonymous IDs and analytical context already approved in the canonical event layer.

Browser clients never receive ClickHouse credentials and do not query ClickHouse directly.

## Local development

ClickHouse remains real and isolated in CI using:

```text
clickhouse/clickhouse-server:26.7.5.10
```

Cloudflare Queues and R2 use Wrangler/workerd local simulation.

Session Worker:

```bash
cp apps/session-worker/.dev.vars.example apps/session-worker/.dev.vars
pnpm session-worker:dev
```

Full local acceptance uses `tests/sessionization`. The harness composes the real production modules only for local execution so the Event Queue, Sessions Queue and R2 simulation can share one workerd state.

## Acceptance coverage

The Sessionization gate proves:

- migration 0001 then 0002 apply in order;
- one-page sessions;
- multiple page views;
- custom events;
- nullable attribution;
- landing and exit;
- duration;
- multiple Workspaces/Pixels;
- visitor/test-mode integrity;
- late and out-of-order events;
- duplicate event delivery;
- repeated session recomputation;
- 5,000-event / 250-session performance smoke;
- real browser SPA landing → checkout → one session / two page views;
- two SDK-style session IDs more than 30 minutes apart → two session facts.

The existing Pixel SDK unit suite independently proves that the SDK reuses a session within 30 minutes and creates a new session after more than 30 minutes of inactivity.

## Runbook

### SESSIONS_QUEUE growing

Check Session Worker query/insert failures, ClickHouse health and consumer error rates. Do not purge Queue messages until retryability is understood.

### Session Worker unavailable

Leave Queue messages pending/retryable. Do not bypass session recomputation by acknowledging messages elsewhere.

### ClickHouse unavailable

Session Worker does not ack. Restore ClickHouse and allow Queue retry to rebuild snapshots from canonical events.

### Sessions DLQ growing

Inspect error codes and safe envelope metadata. Do not copy session IDs, URLs, UTMs or click IDs into operational logs.

### Session integrity violation

Investigate the producer/pixel boundary that created visitor or test-mode inconsistency. Do not choose one value silently.

### Session facts delayed

Compare Event Pipeline health with Sessions Queue backlog. Canonical events can already be present while session facts are waiting to recompute.

### Apparent duplicate sessions

Query `session_facts_current` or the raw table with `FINAL`. Confirm callers are not summing old physical snapshot versions.

## Production provisioning

EPIC 06 does not provision Production infrastructure.

When explicitly approved, Production will require:

- Session Worker deployment;
- Sessions Queue;
- Sessions DLQ;
- Event Worker `SESSIONS_QUEUE` producer binding;
- ClickHouse Cloud service/credentials if still absent;
- explicit application of ClickHouse migration `0002_session_facts.sql`.

No Supabase migration is required by EPIC 06.
