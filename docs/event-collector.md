# Event Collector

## Status

EPIC 04 implements the first Funnel Analytics Data Plane component as a standalone Cloudflare Worker in `apps/collector`.

No Cloudflare production Worker, production Queue, route or DNS record is created by this Epic.

## Runtime and tooling

- Cloudflare Workers
- Wrangler `4.127.1`
- versioned `wrangler.jsonc`
- Cloudflare Queues producer
- Workers Rate Limiting binding
- Supabase Data API as Control Plane registry

The Worker is intentionally separate from `apps/web`.

## Endpoints

### GET /health

Returns a minimal response:

```json
{
  "status": "ok",
  "service": "collector",
  "version": "0.1.0"
}
```

No secret, binding name or environment value is returned.

### POST /v1/events

Accepts `EventBatchV1`.

Successful response:

```json
{
  "accepted": true,
  "event_count": 1,
  "request_id": "..."
}
```

Status is `202 Accepted` only after `EVENTS_QUEUE.send()` resolves.

### OPTIONS /v1/events

Returns `204` for a syntactically valid browser Origin, with:

- `Access-Control-Allow-Origin` echoed from Origin
- `Access-Control-Allow-Methods: POST, OPTIONS`
- `Access-Control-Allow-Headers: Content-Type`
- `Access-Control-Max-Age: 600`
- `Vary: Origin`

No credentials are enabled. CORS is not treated as authorization; domain authorization happens again during POST.

Other methods receive `405`.

## Request ID

Every request gets a Collector-generated UUID in:

```text
X-Request-Id
```

The same ID is used in structured logs and response bodies. Personal data is never used to construct request IDs.

## Request limits

- maximum raw body: 128 KB
- content type: `application/json`
- batch version: `1`
- maximum events: `20`
- batch must be non-empty
- all events in a batch must share one `pixel_key`
- duplicate `event_id` inside one batch is rejected
- event version accepted: `1`
- browser event names accepted: `page_view`, `custom_event`
- future timestamp tolerance: 5 minutes
- past timestamp tolerance: 7 days

The 20-event limit is centralized in `@funnel/event-contracts` and consumed by both SDK and Collector.

## Server-side event validation

The Collector treats the browser as untrusted.

It validates IDs, Pixel key format, timestamps, HTTP page URL, attribution field bounds, click IDs, device/browser/OS shape, viewport/screen values, consent state and test mode.

Custom properties re-use the SDK's shared property constraints and reject prohibited PII/reserved keys server-side.

PII examples rejected:

- email
- phone / telephone / tel
- cpf
- document
- password / pass
- card / credit_card / creditcard
- cvv

Reserved keys such as `event_id`, `visitor_id`, `session_id`, `pixel_key`, `occurred_at`, `event_version` and `sdk_version` cannot appear inside custom properties.

Rejected payloads are not queued.

## Pixel Registry

Core ingestion depends only on:

```ts
interface PixelRegistry {
  resolvePixel(publicKey: string): Promise<PixelRecord | null>;
  touchAccepted(...): Promise<void>;
}
```

Implementations:

- `SupabasePixelRegistry` for preview/production
- `LocalPixelRegistry` for deterministic local integration tests

The Supabase implementation resolves Pixel and domains in a single REST request.

The preferred server credential is `SUPABASE_SECRET_KEY` (`sb_secret_...`). Legacy `service_role` may be used only if it is the actual supported key available, but is never committed or exposed.

Control Plane lookup has a 2.5 second timeout. If validation cannot be completed, the Collector returns `503`; it never accepts an unvalidated Pixel.

## Pixel status

Only `active` Pixels ingest events.

`paused`, `archived` and unknown public keys return the generic `PIXEL_NOT_AVAILABLE` response without disclosing internal state.

## Origin and domains

Authorization uses the browser `Origin` header as the primary source. Missing or invalid Origin is rejected.

`page_url` is not trusted for domain authorization. After Origin authorization, its hostname must also match the Origin hostname to block obvious spoofing.

Authorized domains reuse `domainMatchesAuthorizedPattern()` from `@funnel/pixel/domains`.

Domain states:

- `pending`: accepted
- `active`: accepted
- `blocked`: rejected

Wildcard `*.example.com` accepts subdomains such as `checkout.example.com` and rejects lookalikes such as `fakeexample.com` and `example-fake.com`.

## Operational metadata

After Queue acceptance, `ctx.waitUntil()` schedules non-critical Control Plane telemetry:

Pixel:

- `last_event_at`
- `health_status: pending → healthy`

Domain:

- `last_seen_at`
- when pending: `status → active`, `verified_at`

`health_score` is not synthesized.

Telemetry failure cannot turn an already queued event into a failure response.

## Queue

Binding:

```text
EVENTS_QUEUE
```

The Collector is a producer only.

Queue message:

```ts
interface CollectorEnvelopeV1 {
  envelope_version: 1;
  request_id: string;
  received_at: string;
  collector_version: string;
  workspace_id: string;
  pixel_id: string;
  origin_host: string;
  source: 'browser';
  events: BrowserEventV1[];
}
```

No raw IP is put in the envelope.

Cloudflare Queues have at-least-once delivery semantics; `event_id` therefore remains mandatory for downstream deduplication in EPIC 05.

If Queue send fails, response is `503 QUEUE_UNAVAILABLE`, never `202`.

## Rate limiting

Binding:

```text
EVENTS_RATE_LIMITER
```

V1 configuration:

- 120 requests
- 60 seconds
- per Cloudflare location and composite key

The rate-limit key combines Pixel public key with an ephemeral SHA-256-derived IP token. The raw IP is neither logged nor queued.

Rate limit returns `429 RATE_LIMITED` with `Retry-After: 60`.

Rate limiting is abuse protection, not billing/accounting.

## SDK retry alignment

`HttpTransport` retries:

- 429
- 500
- 502
- 503
- 504
- network failure

It does not retry:

- 400
- 403
- 404
- 413
- 422

Retries remain bounded by the SDK queue configuration.

## Errors

Public error codes:

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

Responses never expose stack traces, raw Supabase errors or prohibited property values.

## Logging

Structured logs may contain:

- request_id
- workspace_id
- pixel_id
- origin_host
- event_count
- status_code
- latency_ms
- queue_latency_ms
- error code

They never include event body, visitor/session IDs, click IDs, custom properties, raw IP or Supabase credentials.

## Environments

`wrangler.jsonc` defines conceptual:

- local
- preview
- production

Queue names and Rate Limiting namespaces are different across environments.

Production resources are intentionally not provisioned in this Epic.

## Local development

```bash
cp apps/collector/.dev.vars.example apps/collector/.dev.vars
pnpm collector:dev
```

Wrangler/Miniflare simulate Queue and Rate Limiting locally.

The local registry may be injected through `LOCAL_PIXEL_REGISTRY_JSON`; this bypass exists only when `COLLECTOR_ENV=local`.

## Tests

Collector test coverage includes:

- valid/empty/oversized batches
- malformed JSON
- body size
- event version/name
- duplicate IDs
- PII/reserved properties
- Pixel status
- exact/wildcard Origin
- wildcard lookalikes
- page URL spoofing
- CORS
- Queue failure
- Rate Limit
- Supabase registry/metadata adapter
- 200-request local smoke test
- real Chromium: `pixel.js → HttpTransport → wrangler dev → local Queue → 202`
- SPA landing/checkout integration

## Current limitations

Not implemented:

- definitive Queue consumer
- R2 raw archive
- ClickHouse
- global deduplication/replay
- definitive event normalization
- session facts
- event facts
- production Collector URL/CDN wiring

Those belong to EPIC 05 or later.
