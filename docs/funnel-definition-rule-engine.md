# Funnel Definition + Rule Engine Foundation

## Scope

EPIC 09 creates the first versioned Funnel Definition control plane and a deterministic rule evaluator.

The architecture is intentionally split:

```text
Supabase Control Plane
funnels
  → funnel_versions
    → funnel_steps

Data Plane contract
normalized event
  + immutable funnel version
  → Rule Engine V1
  → matching step keys
```

The EPIC does not materialize funnel analytics yet.

## Control Plane

### Funnels

`public.funnels` is the mutable identity and metadata record for a funnel.

A funnel is Workspace-scoped and has one of these states:

- `draft`
- `active`
- `archived`

An active or archived funnel references exactly one `current_version_id`.

There is no hard-delete RPC. Archiving preserves the funnel and all historical versions.

### Funnel versions

`public.funnel_versions` is append-only from the authenticated application boundary.

Each version records:

- Workspace;
- Funnel;
- monotonically increasing version number;
- definition schema version (`1`);
- mode (`ordered`);
- conversion window;
- creator and timestamp.

Editing a funnel definition creates a new version rather than mutating the previous one.

`create_funnel_version_v1` requires `expected_current_version`. The funnel row is locked before publishing the next version. If another editor already published a newer definition, the RPC returns `FUNNEL_VERSION_CONFLICT` rather than silently overwriting it.

### Funnel steps

`public.funnel_steps` belongs to one immutable funnel version.

Each step stores:

- `step_key` — stable key within the version;
- `position` — 1-based ordered position;
- display name;
- Rule AST as JSONB.

V1 supports 2–20 steps.

The database validates the version/step envelope, shape, size, unique step keys and ordering constraints. Full operator/AST semantics are validated by `@funnel/rule-engine`.

## Authorization

New RBAC permissions:

```text
funnels.view
funnels.manage
```

Role matrix:

| Role | View | Manage |
| --- | --- | --- |
| Owner | yes | yes |
| Admin | yes | yes |
| Analyst | yes | no |
| Viewer | yes | no |

Authenticated users receive SELECT-only access through RLS. Funnel mutations happen through controlled RPCs.

Cross-Workspace access is denied by the same `private.permission_allowed(...)` boundary used by the existing Control Plane.

## RPCs

### `create_funnel_v1`

Creates:

1. Funnel identity;
2. Version 1;
3. Ordered steps;
4. active current-version pointer;
5. audit event.

### `create_funnel_version_v1`

Creates a new immutable definition using optimistic concurrency.

It rejects:

- missing permission;
- archived funnels;
- stale `expected_current_version`;
- invalid step envelopes;
- unsupported conversion windows.

### `update_funnel_metadata_v1`

Updates only mutable funnel metadata (name/description), never historical definitions.

### `archive_funnel_v1`

Archives without deleting historical definitions.

## Rule Engine V1

Rule nodes:

```text
condition
all(...)
any(...)
not(...)
```

Operators:

```text
equals
not_equals
contains
starts_with
ends_with
exists
in
gt
gte
lt
lte
```

Static event fields include:

- event/custom-event name;
- page URL/path/title;
- origin/referrer;
- UTM source/medium/campaign/content/term;
- device/browser/OS;
- language/timezone;
- `test_mode`.

Nested event properties use `properties.<path>`.

Example:

```json
{
  "kind": "group",
  "combinator": "all",
  "rules": [
    {
      "kind": "condition",
      "field": "custom_event_name",
      "operator": "equals",
      "value": "checkout_started"
    },
    {
      "kind": "condition",
      "field": "properties.value",
      "operator": "gte",
      "value": 100
    }
  ]
}
```

## Determinism and safety

Rules are declarative data.

The engine does not execute user code and does not support arbitrary regular expressions. Nested JSON lookup is own-property-only and rejects `__proto__`, `prototype` and `constructor` path segments.

Complexity is bounded to avoid pathological definitions.

## Historical correctness

Downstream facts must carry the immutable `funnel_version_id` used during evaluation.

A future edit to a funnel therefore cannot reinterpret historical conversions using a newer definition.

## Audit

Control-plane mutations write audit events:

- `funnel.created`
- `funnel.version_created`
- `funnel.metadata_updated`
- `funnel.archived`

Rule payloads are not copied into audit metadata.

## Out of scope

EPIC 09 does not implement:

- Funnel Builder UI;
- ordered step progression across a Journey;
- `step_hits`;
- `transition_facts`;
- `conversion_facts`;
- conversion attribution;
- checkout/purchase normalization;
- dashboard metrics;
- funnel-specific ClickHouse tables;
- background recomputation after definition changes.

These layers build on the immutable funnel-version contract introduced here.
