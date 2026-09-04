# ADR 0005 — Strict ordered funnel attempts

## Status

Accepted for EPIC 10.

## Context

Funnel definitions are ordered, but event streams can contain repeated, overlapping and out-of-order matches. Without explicit progression semantics, analytics can differ between implementations or accidentally skip required steps.

## Decision

Funnel Progression V1 uses strict ordered attempts.

An attempt begins on the first event that matches step 1. It may advance only when a later ordered event matches the next expected step. Events matching later steps are ignored until their predecessors have been reached.

One event advances at most one step.

The funnel conversion window begins at step 1. When the window expires, the open attempt remains incomplete. A later step-1 event can begin a new attempt. A completed attempt also closes immediately, allowing a later step-1 event to open another attempt in the same Journey.

Attempt IDs are deterministic UUIDv5 values based on immutable Funnel Version, Journey, attempt index and first event ID.

## Consequences

Benefits:

- no implicit step skipping;
- reproducible facts from the same event set;
- overlapping rules cannot create multi-step conversions from one event;
- repeated funnel attempts are measurable;
- window expiration has explicit semantics.

Trade-offs:

- funnels that intentionally allow skipped steps need a future mode/version;
- broad overlapping rules require deliberate authoring;
- a conversion event that occurred before a required intermediate step does not count for that attempt.

These trade-offs are preferable to ambiguous conversion metrics in V1.
