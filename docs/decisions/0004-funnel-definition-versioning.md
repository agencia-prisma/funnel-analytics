# ADR 0004 — Version funnel definitions instead of mutating them

## Status

Accepted for EPIC 09.

## Context

Funnel analytics must remain reproducible after a user edits a funnel. If step definitions are updated in place, historical events can be reinterpreted by rules that did not exist when the original analysis was produced.

## Decision

A funnel has a stable identity (`funnels.id`) and immutable definition snapshots (`funnel_versions.id`). Each snapshot owns its ordered `funnel_steps`.

Editing the definition appends a new version. Publishing requires the caller's `expected_current_version`; a stale write fails with `FUNNEL_VERSION_CONFLICT`.

Downstream analytical facts must reference the immutable `funnel_version_id` used for evaluation.

## Consequences

Benefits:

- historical analytics are reproducible;
- concurrent edits cannot silently overwrite one another;
- recomputation can target an explicit version;
- archiving does not destroy historical definitions.

Costs:

- definitions consume append-only storage;
- downstream data models must carry a version identifier;
- changing a funnel requires a publish/version step rather than an in-place update.

These costs are intentional and preferable to mutable analytical semantics.
