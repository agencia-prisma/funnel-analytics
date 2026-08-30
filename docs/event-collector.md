# Event Collector

## Status

EPIC 04 implements the first Data Plane component: a Cloudflare Worker that validates browser batches and produces versioned messages to Cloudflare Queues.

ClickHouse, R2 and the definitive Queue consumer remain out of scope until EPIC 05.

## HTTP

### GET /health

Returns `200` with only:

```json
{
  "status": "ok",
  "service": "collector",
  "version": "0.1.0"
}
```

### POST /v1/events

Accepts `application/json` containing `EventBatchV1`.

Success is `202 Accepted` only after the Queue producer binding resolves:

```json
{
  "accepted": true,
  "event_count": 1,
  "request_id": "..."
}
```

`202` means Queue acceptance, not ClickHouse persistence.

### OPTIONS /v1/events

Returns `204` for a syntactically valid browser Origin with:

- `Access-Control-Allow-Origin` echoing the Origin
- `Access-Control-Allow-Methods: POST, OPTIONS`
- `Access-Control-Allow-Headers: Content-Type`
- `Access-Control-Max-Age: 600`
- `Vary: Origin`

No credentials are enabled. CORS is not authentication; the POST performs Pixel/domain authorization.

## Request limits

- body hard limit: 128 KB
- EventBatchV1 hard limit: 20 events
- only `application/json`
- event version: 1
- browser event names: `page_view`, `custom_event`
- occurred_at: max +5 minutes future / max 7 days past
- duplicate event IDs in one batch: rejected
- mixed Pixel keys in one batch: rejected
- property limits reuse `@funnel/pixel/properties`

## Error codes

Standard error body:

```json
{
  "accepted": false,
  "error": {
    "code": "INVALID_BATCH"
  },
  "request_id": "..."
}
```

Codes:

- `INVALID_REQUEST`
- `PAYLOAD_TOO_LARGE`
- `INVALID_BATCH`
- `INVALID_EVENT`
- `UNSUPPORTED_EVENT_VERSION`
- `PII_NOT_ALLOWED`
- `PIXEL_NOT_AVAILABLE`
- `ORIGIN_NOT_ALLOWED`
- `RATE_LIMITED`
- `QUEUE_UNAVAILABLE`
- `CONTROL_PLANE_UNAVAILABLE`
- `INTERNAL_ERROR`

The Worker never returns stack traces, raw PostgREST errors or event payloads.

## Pixel Registry

The Collector depends on a `PixelRegistry` abstraction.

Production implementation: `SupabasePixelRegistry`.

One Data API resolution fetches the Pixel and related domains. The server-side credential is supplied only through `SUPABASE_SECRET_KEY`. New Supabase `sb_secret_...` keys are preferred; the legacy service-role credential remains compatible as a backend fallback.

The key is never:

- committed
- returned to the client
- logged
- prefixed with `NEXT_PUBLIC_`
- sent by pixel.js

The Control Plane lookup has a 2.5 second timeout. If the Control Plane cannot validate the Pixel/domain, ingestion returns `503`.

## Pixel status

Only `active` Pixels ingest events.

Missing, paused and archived Pixels all return the same `404 PIXEL_NOT_AVAILABLE` response to avoid resource enumeration.

## Origin and domains

Browser requests require a syntactically valid `Origin`.

Authorization uses the Origin hostname, never `page_url` alone.

The Origin is checked against `pixel_domains` using the shared EPIC 02 domain matcher.

Accepted domain status:

- pending
- active

Rejected:

- blocked

Wildcard `*.example.com` accepts `checkout.example.com` but not `fakeexample.com` or `example-fake.com`.

Every event's `page_url` hostname must equal the validated Origin hostname. Suspicious disagreement is rejected.

## Domain verification and operational metadata

Only after Queue acceptance, `ctx.waitUntil()` schedules:

- `pixels.last_event_at`
- pending `pixels.health_status -> healthy`
- `pixel_domains.last_seen_at`
- pending `pixel_domains.status -> active`
- pending `pixel_domains.verified_at`

`health_score` remains untouched/null.

Telemetry update failure does not undo an event already accepted by the Queue.

## PII defense

The Worker repeats PII and reserved-property checks server-side. Browser validation is not trusted.

Rejected property keys include email/phone/telephone/CPF/document/password/card/credit-card/CVV variants.

Reserved event identity/version fields cannot be overridden through custom properties.

Raw event bodies, properties, visitor IDs, session IDs and click IDs are never logged.

## Queue

Binding: `EVENTS_QUEUE`.

Envelope: `CollectorEnvelopeV1`.

Fields:

- envelope_version
- request_id
- received_at
- collector_version
- workspace_id
- pixel_id
- origin_host
- source = browser
- events

Raw IP is not included.

Cloudflare Queues is at-least-once. `event_id` is therefore preserved for downstream deduplication in EPIC 05.

If Queue send fails, the Worker returns `503 QUEUE_UNAVAILABLE`, never `202`.

## Rate limit

Binding: `EVENTS_RATE_LIMITER`.

V1 configuration: 120 requests per 60 seconds per Cloudflare location/key.

The key combines:

- Pixel public key
- ephemeral SHA-256-derived IP component

Raw IP is not persisted in the Queue or logs.

A limited request returns `429` and `Retry-After: 60`.

## SDK retry contract

The browser `HttpTransport` retries:

- 429
- 500
- 502
- 503
- 504
- network errors

It does not retry:

- 400
- 403
- 404
- 413
- 422

Retries remain bounded by the SDK.

## Environments

Wrangler configuration separates:

- local: simulated Queue + simulated Rate Limiting
- preview: separate preview Queue/binding names
- production: separate production Queue/binding names

No remote Cloudflare resource is created by the EPIC 04 implementation.

Local development uses a deterministic `LOCAL_PIXEL_REGISTRY_JSON` only when `COLLECTOR_ENV=local`. Preview/production require the Supabase-backed registry.

## Security

The Collector:

- does not use cookies or SaaS user sessions
- does not use `credentials: include`
- does not authorize via page_url
- does not allow missing Origin in production
- does not persist raw IP
- does not add Cloudflare geo enrichment
- does not use eval/new Function
- bounds body, arrays and properties
- never logs Supabase secrets
- never logs full event payloads

## Local/browser acceptance

The CI starts Wrangler locally using workerd/Miniflare and its local Queue/Rate Limit simulations, then loads `pixel.min.js` in Chromium with the real `HttpTransport`.

The acceptance test proves:

```text
fixture HTML
-> pixel.js
-> HttpTransport
-> POST /v1/events
-> local Cloudflare Worker
-> local Queue
-> 202 Accepted
```

It also verifies SPA navigation produces a second accepted page_view with the original attribution.

## Current limitations

Not implemented:

- Queue consumer pipeline
- R2 raw archive
- ClickHouse
- global replay/deduplication
- final event normalization
- session/event facts
- Identity/Journey engines
- remote Cloudflare Preview or Production resources
