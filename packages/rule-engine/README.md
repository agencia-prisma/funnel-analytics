# Rule Engine

EPIC 09 introduces Funnel Definition V1 and deterministic funnel-rule evaluation.

## Contract

A funnel definition is versioned and ordered:

```ts
{
  definition_version: 1,
  mode: 'ordered',
  conversion_window_seconds: 2592000,
  steps: [
    {
      step_key: 'landing',
      name: 'Landing',
      rule: {
        kind: 'condition',
        field: 'page_path',
        operator: 'equals',
        value: '/',
      },
    },
    {
      step_key: 'checkout',
      name: 'Checkout',
      rule: {
        kind: 'condition',
        field: 'custom_event_name',
        operator: 'equals',
        value: 'checkout_started',
      },
    },
  ],
}
```

V1 supports 2–20 ordered steps and a conversion window from 60 seconds to 90 days.

## Rule AST

Rules are data, never executable code.

Supported nodes:

- `condition`
- `group` with `all` or `any`
- `not`

Supported operators:

- `equals`
- `not_equals`
- `contains`
- `starts_with`
- `ends_with`
- `exists`
- `in`
- `gt`
- `gte`
- `lt`
- `lte`

Supported static fields include event name, custom-event name, URL/path/title, origin/referrer, UTM dimensions, device, browser, OS, language, timezone and `test_mode`.

Custom event data is addressable through `properties.<path>`, for example `properties.product.category` or `properties.value`.

## Safety and determinism

The evaluator deliberately does not support:

- `eval()` or `new Function()`;
- user-supplied regular expressions;
- prototype-chain property traversal;
- unbounded rule trees.

Limits:

- maximum rule depth: 5;
- maximum rule nodes: 25;
- `in` list: maximum 50 scalar values;
- property path: maximum 180 characters;
- step rule payload persisted by Supabase: maximum 16 KB.

The same validated definition and normalized event always produce the same matching step keys.

## Scope boundary

EPIC 09 answers only: **which funnel-step rules match an event?**

It does not yet perform ordered journey progression or persist:

- `step_hits`;
- `transition_facts`;
- `conversion_facts`.

Those are downstream concerns and must use immutable funnel-version IDs so historical analytics remain reproducible after a funnel definition changes.
