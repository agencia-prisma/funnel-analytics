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
ClickHouse batch insert
  ↓
ack
```

Transient failures do not ack and rely on Cloudflare Queue retry. Permanent invalid envelopes are sent to `EVENTS_DLQ` and acked only after the DLQ send succeeds.

## Bindings

- Queue consumer: `EVENTS_QUEUE`
- DLQ producer: `EVENTS_DLQ`
- R2: `EVENTS_RAW_BUCKET`
- Secrets: `CLICKHOUSE_URL`, `CLICKHOUSE_USERNAME`, `CLICKHOUSE_PASSWORD`

Production resources are described in `wrangler.jsonc` but are not provisioned automatically by EPIC 05.

## Local

```bash
cp apps/event-worker/.dev.vars.example apps/event-worker/.dev.vars
pnpm event-worker:dev
```

The full local acceptance uses the dedicated harness in `tests/pipeline`, which keeps production Collector and Event Worker code separate while exercising real local Queue/R2 bindings in one workerd runtime.
