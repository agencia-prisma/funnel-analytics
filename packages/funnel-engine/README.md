# Funnel Progression Engine

EPIC 10 turns an immutable Funnel Definition V1 plus the ordered events of one Journey into deterministic analytical facts.

## Inputs

The engine receives:

- Workspace ID;
- Funnel ID;
- immutable Funnel Version ID and version number;
- Journey ID;
- optional Person ID;
- `test_mode` partition;
- validated Funnel Definition V1;
- normalized events belonging to the Journey.

## Ordered progression semantics

V1 uses strict ordered progression.

For a funnel:

```text
Landing → Lead → Checkout → Purchase
```

an event that matches `Checkout` before `Lead` does not advance the attempt. The engine waits for the expected next step.

One event advances at most one step, even when overlapping rules could match multiple consecutive steps.

## Attempts

A Funnel attempt starts only when an event matches step 1.

The conversion window starts at that event. If the expected progression does not complete before the configured window expires, that attempt remains incomplete. A later event matching step 1 can start another attempt within the same Journey.

After a completed conversion, a later step-1 event can also start a new attempt.

Each attempt gets a deterministic UUIDv5 derived from:

```text
workspace_id
funnel_version_id
journey_id
attempt_index
first_event_id
```

## Facts

The engine emits three fact families.

### Step hits

One fact per reached step per attempt, containing the event/session/visitor/pixel that satisfied the step and elapsed time since funnel entry.

### Transition facts

One fact per consecutive transition, with time from the previous reached step to the next reached step.

### Conversion facts

One fact per completed attempt, with entry event, conversion event and total conversion duration.

## Determinism

Events are ordered by:

1. `occurred_at`;
2. `received_at`;
3. `event_id`.

Duplicate event IDs are rejected rather than resolved from input order.

The same definition, Journey identity and event set always produce the same facts and attempt IDs.

## Limits

A single evaluation accepts at most 100,000 events. Funnel-definition complexity remains bounded by `@funnel/rule-engine`.

## Scope boundary

EPIC 10 materializes progression facts. It does not yet implement:

- revenue/AOV normalization;
- conversion attribution across acquisition channels;
- historical backfill when a brand-new Funnel Version is published;
- dashboard aggregation APIs;
- Funnel Builder UI.
