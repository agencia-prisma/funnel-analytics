# @funnel/pixel

Framework-independent Browser Tracking SDK plus the Pixel Control Plane helpers.

## Browser build

```bash
pnpm --filter @funnel/pixel build
pnpm --filter @funnel/pixel check:size
```

Outputs:

- `dist/pixel.js`
- `dist/pixel.min.js`

The runtime bundle has zero external dependencies.

## Browser API

After bootstrap:

```js
window.funnelAnalytics.track('custom_name', { product: 'shoe' });
window.funnelAnalytics.consent({ analytics: true });
window.funnelAnalytics.getVisitorId();
window.funnelAnalytics.getSessionId();
window.funnelAnalytics.flush();
```

`identify()` only returns the current anonymous IDs. PII identity capture is deliberately not implemented.

## Source layout

- `config.ts` — safe script configuration and SDK constants
- `ids.ts` — UUIDv7 visitor/event IDs
- `storage.ts` — first-party namespaced storage
- `session.ts` — 30-minute inactivity session lifecycle
- `context.ts` — sanitized page/referrer/browser context
- `attribution.ts` — UTMs, click IDs, first/session touch
- `device.ts` — lightweight device/browser/OS classification
- `consent.ts` — configurable consent state
- `events.ts` — BrowserEventV1 creation
- `queue.ts` — bounded buffer, batch and retry
- `transport.ts` — HttpTransport/TestTransport
- `spa.ts` — pushState/replaceState/popstate tracking
- `cross-domain.ts` — opaque linker preparation
- `bootstrap.ts` — public API/runtime orchestration
- `browser-entry.ts` — defensive, duplicate-safe auto bootstrap

Full architecture and limitations: `docs/pixel-sdk.md`.
