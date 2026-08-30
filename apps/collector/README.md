# Event Collector

Cloudflare Worker responsible for public browser event ingress.

## Architecture

```text
pixel.js
  -> POST /v1/events
  -> validate request + EventBatchV1
  -> resolve Pixel + authorized domains
  -> rate limit
  -> Cloudflare Queue
  -> 202 Accepted
```

A `202` means the Queue accepted the message. It does not mean ClickHouse persistence has happened.

## Commands

From the monorepo root:

```bash
pnpm collector:dev
pnpm --filter @funnel/collector test
pnpm --filter @funnel/collector typecheck
pnpm --filter @funnel/collector build
pnpm test:collector-browser
```

Copy `apps/collector/.dev.vars.example` to `.dev.vars` for local Wrangler development.

## Endpoints

- `GET /health`
- `POST /v1/events`
- `OPTIONS /v1/events`

## Bindings

- `EVENTS_QUEUE` — Cloudflare Queue producer
- `EVENTS_RATE_LIMITER` — Cloudflare Rate Limiting binding
- `SUPABASE_URL` — server-side Control Plane URL
- `SUPABASE_SECRET_KEY` — secret binding, never browser/public
- `COLLECTOR_ENV` — local / preview / production

The default Wrangler environment is local-only and includes a local Queue consumer that only acknowledges simulated messages. Preview/production configs are producer-only.

See `docs/event-collector.md` for the complete contract and security model.
