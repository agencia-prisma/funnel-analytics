# Event Worker

Cloudflare Queue consumer for the Funnel Analytics persistent event pipeline.

## Flow

```text
Cloudflare Queue
  ↓
CollectorEnvelopeV1 validation
  ↓
R2 raw archive
  ↓
NormalizedEventV1
  ↓
ClickHouse events batch insert
  ↓
SESSIONS_QUEUE recompute commands
  ↓
ack EVENTS_QUEUE
```

A Queue message is acknowledged only after R2, the canonical ClickHouse event insert, and publication of every required `SessionRecomputeEnvelopeV1` command succeed. If the Sessions Queue is unavailable after ClickHouse succeeds, the original event message retries; R2 and ClickHouse idempotency keep the retry safe.

Transient failures do not ack and rely on Cloudflare Queue retry. Permanent invalid envelopes are sent to `EVENTS_DLQ` and acked only after the DLQ send succeeds.

## Bindings

- Queue consumer: `EVENTS_QUEUE`
- Event DLQ producer: `EVENTS_DLQ`
- Session recompute producer: `SESSIONS_QUEUE`
- R2: `EVENTS_RAW_BUCKET`
- Secrets: `CLICKHOUSE_URL`, `CLICKHOUSE_USERNAME`, `CLICKHOUSE_PASSWORD`

Production resources are described in `wrangler.jsonc` but are not provisioned automatically.

## Local

```bash
cp apps/event-worker/.dev.vars.example apps/event-worker/.dev.vars
pnpm event-worker:dev
```

The EPIC 05 acceptance remains in `tests/pipeline`. EPIC 06 adds the complete downstream acceptance in `tests/sessionization`.
