# @funnel/collector

Cloudflare Worker responsible for browser event ingress.

## Responsibilities

```text
pixel.js
  ↓
POST /v1/events
  ↓
request / EventBatchV1 validation
  ↓
Pixel + Origin authorization
  ↓
rate limit
  ↓
Cloudflare Queue producer
  ↓
202 Accepted
```

A `202` response means only that Cloudflare Queue accepted the envelope. It does not mean ClickHouse persistence.

## Local development

Copy the example local variables:

```bash
cp apps/collector/.dev.vars.example apps/collector/.dev.vars
```

Then run:

```bash
pnpm collector:dev
```

Local Wrangler execution uses locally simulated Queue and Rate Limiting bindings. `LOCAL_PIXEL_REGISTRY_JSON` may be used only in `COLLECTOR_ENV=local` so browser integration tests do not depend on production Supabase.

## Commands

```bash
pnpm --filter @funnel/collector typecheck
pnpm --filter @funnel/collector test
pnpm --filter @funnel/collector build
pnpm test:collector-browser
```

## Secrets

Preview/production use:

- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY`

`SUPABASE_SECRET_KEY` must be a Cloudflare secret binding. It must never be committed, logged, exposed through `NEXT_PUBLIC_*`, or shipped to a browser.

## Current boundary

EPIC 04 is producer-only. The definitive Queue consumer, raw archive, ClickHouse, global deduplication and event normalization belong to EPIC 05.
