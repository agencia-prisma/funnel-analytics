# Session Worker

Cloudflare Queue consumer that materializes recomputable session snapshots in ClickHouse.

## Flow

```text
SESSIONS_QUEUE
  ↓
SessionRecomputeEnvelopeV1 validation
  ↓
events FINAL filtered by Workspace + Pixel + session IDs
  ↓
session snapshot calculation
  ↓
session_facts batch insert
  ↓
ack
```

The browser SDK remains the authority for browser V1 `session_id` creation. The Session Worker does not invent a new session identity; it consolidates facts for the existing identifier.

## Bindings

- Queue consumer: `SESSIONS_QUEUE`
- DLQ producer: `SESSIONS_DLQ`
- Secrets: `CLICKHOUSE_URL`, `CLICKHOUSE_USERNAME`, `CLICKHOUSE_PASSWORD`

Local and conceptual Preview/Production bindings are versioned in `wrangler.jsonc`. EPIC 06 does not provision Production resources.

## Local

```bash
cp apps/session-worker/.dev.vars.example apps/session-worker/.dev.vars
pnpm session-worker:dev
```

For the full local acceptance, use the dedicated harness in `tests/sessionization`. It composes the production Collector, Event Worker and Session Worker code in one local workerd runtime only so Queue/R2 state can be shared without provisioning remote resources.
