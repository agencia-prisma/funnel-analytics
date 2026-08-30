# Funnel Analytics Browser Pixel SDK

## Status

EPIC 03 implements the browser SDK and its transport abstraction. The real Event Collector, Queue and ClickHouse ingestion remain intentionally out of scope until EPIC 04.

## Installation

The browser build generates:

- `packages/pixel/dist/pixel.js`
- `packages/pixel/dist/pixel.min.js`

The production CDN is not active yet. The Control Plane snippet therefore continues to display the explicit future-CDN placeholder instead of pretending a Collector/CDN exists.

Conceptual installation:

```html
<script
  async
  src="https://cdn.DOMINIO-FUTURO.com/pixel.js"
  data-pixel-id="px_pub_xxx">
</script>
```

Supported safe data attributes:

- `data-pixel-id` — required public Pixel key.
- `data-endpoint` — optional HTTP/HTTPS transport endpoint.
- `data-debug="true"` — structured console diagnostics without full payloads.
- `data-test-mode="true"` — routes batches to the in-browser TestTransport.
- `data-consent-required="true"` — blocks analytics until explicit grant.

## Global API

The SDK exposes only the namespaced global:

```ts
window.funnelAnalytics
```

Methods:

- `track(name, properties?)`
- `identify()` — returns the current anonymous visitor/session IDs; it does not accept PII traits.
- `consent({ analytics, identification })`
- `getVisitorId()`
- `getSessionId()`
- `flush()`

## IDs

Visitor and session IDs use a dependency-free UUIDv7 implementation backed by `crypto.getRandomValues()`.

Visitor persistence:

- first-party cookie `_fa_vid`
- `SameSite=Lax`
- `Secure` on HTTPS
- `Path=/`
- 365 day default
- localStorage mirror/fallback

Sessions are stored under `_fa_session` and expire after 30 minutes of inactivity.

Every browser event receives its own `event_id` before transport.

## Attribution

The SDK captures and persists:

- `utm_source`
- `utm_medium`
- `utm_campaign`
- `utm_content`
- `utm_term`
- `fbclid`
- `ttclid`
- `gclid`
- `msclkid`
- `tblci`

`_fa_first_touch` is never overwritten after creation. `_fa_session_touch` is replaced only when a new session starts, so internal SPA navigation does not turn a paid session into direct traffic.

## Page context

`page_view` includes sanitized URL/path/title/referrer, attribution, anonymous IDs, device/browser/OS category, screen/viewport, language, timezone, consent state and test-mode flag.

Known sensitive query parameters are stripped. Email-like page titles are redacted.

No fingerprint identifier is produced.

## Consent

States are:

- `unknown`
- `granted`
- `denied`

Legal policy remains a client decision. When `data-consent-required="true"`, unknown/denied analytics consent prevents IDs/events from being persisted or queued.

Setting `identification: false` keeps analytics possible after grant but disables persistent visitor/session identity.

## SPA

The SDK patches only:

- `history.pushState`
- `history.replaceState`
- `popstate`

A new `page_view` is generated only when origin/path/query changes. Hash-only changes are ignored.

Duplicate SDK bootstrap is guarded globally, so duplicate snippets do not generate duplicate initial page views.

## Custom events

```js
window.funnelAnalytics.track('cta_clicked', {
  product: 'shoe',
  placement: 'hero'
});
```

Limits:

- max 30 object properties per level
- max key length 64
- max string length 256
- max depth 3
- max array length 10

PII/reserved keys such as `email`, `phone`, `cpf`, `password`, `credit_card`, `visitor_id`, `session_id`, `event_id` and `pixel_key` are removed.

## Queue and transport

Events enter an in-memory queue with a small namespaced localStorage recovery buffer when persistence is permitted.

Defaults:

- max 100 queued events
- max 20 events per batch
- max 64 KB serialized batch
- flush interval 5 seconds
- retry max 3 using bounded exponential backoff

Flush triggers:

- batch threshold
- timer
- `visibilitychange → hidden`
- `pagehide`
- manual `flush()`

`HttpTransport` uses `sendBeacon()` during unload when possible and falls back to `fetch(..., { keepalive: true })`.

`TestTransport` is used by browser/E2E tests. The core SDK does not know anything about Cloudflare Worker internals.

## Cross-domain preparation

`decorateLink()` and `readLinkerToken()` support an opaque `_fa_linker` token contract.

Raw visitor UUIDs are explicitly rejected as linker tokens. Signed short-lived token issuance/validation belongs to a future server-side Epic.

## Build and performance

Build tooling is development-only; the browser runtime has no external dependency.

Bundle thresholds:

- warning above 12 KB gzip
- hard failure above 20 KB gzip
- architectural target remains below 15 KB gzip

No public sourcemap is generated.

## Current limitations

Not implemented in EPIC 03:

- real Event Collector
- Cloudflare Queue
- ClickHouse
- server-side linker token
- automatic form/lead/checkout/purchase tracking
- Identity Resolution
- production CDN activation
