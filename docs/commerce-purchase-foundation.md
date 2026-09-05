# Commerce / Purchase Foundation

EPIC 11 adds deterministic financial materialization on top of the existing event and Journey pipeline.

## Pipeline

```text
Collector → Event Worker → Session → Journey Worker
                                 ├─→ Funnel Queue → Funnel Worker
                                 └─→ Commerce Queue → Commerce Worker → Commerce Facts
```

The Commerce Worker does not ingest browser traffic directly. It recomputes from canonical events linked to a persisted Journey, which allows identity-driven Journey reconstruction to move/tombstone commercial facts without duplicating revenue.

## Canonical browser events

Commerce V1 uses `custom_event` with one of these `custom_event_name` values:

- `checkout_started`
- `purchase`
- `refund`
- `order_cancelled`

A native normalized `event_name = purchase` is also accepted by the Commerce Engine for future server-side/gateway ingestion.

### Monetary values

All monetary values are integer **minor units**. For BRL, `14990` means R$ 149,90. Floating-point currency values are rejected.

Example purchase properties:

```json
{
  "provider": "custom",
  "order_id": "order_123",
  "currency": "BRL",
  "value_minor": 14990,
  "discount_minor": 1000,
  "shipping_minor": 0,
  "tax_minor": 0,
  "items": [
    {
      "item_id": "sku_1",
      "name": "Produto",
      "quantity": 1,
      "unit_price_minor": 14990
    }
  ]
}
```

`provider` defaults to `custom`. Future adapters such as Hotmart and Kiwify must normalize their payloads into this same canonical model instead of creating gateway-specific fact schemas.

## Order semantics

Orders are identified by `(workspace_id, provider, order_id)`.

- The first valid purchase event creates the canonical order.
- A materially identical duplicate purchase for the same order is ignored.
- A conflicting duplicate is rejected with `COMMERCE_ORDER_CONFLICT`.
- Refunds accumulate deterministically and may not exceed the original charged amount.
- `order_cancelled` changes status to `cancelled`; it does not invent a refund.
- `net_amount_minor = gross_amount_minor - refunded_amount_minor`.
- `value_minor` is the charged order total before refunds. Discount/shipping/tax are stored as components and are not used to recompute gross.

## ClickHouse facts

Migration `0006_commerce_facts.sql` creates:

- `commerce_checkout_facts` + `commerce_checkout_facts_current`
- `commerce_revenue_facts` + `commerce_revenue_facts_current`
- `commerce_item_facts` + `commerce_item_facts_current`

Facts are `ReplacingMergeTree(fact_version, is_deleted)` and use the Journey version scheme:

- tombstone: `2 * source_journey_version`
- active: `2 * source_journey_version + 1`

This makes at-least-once Queue delivery and Journey recomputation idempotent.

No buyer email, phone, CPF, encrypted identifier, or blind index is stored in commerce fact tables.

## Metrics unlocked

`commerce_revenue_facts_current` is sufficient for the next query layer to calculate:

- paid orders / sales
- gross revenue
- refunded revenue
- net revenue
- AOV
- revenue by Journey
- revenue by person when `person_id` is available
- later, revenue by Funnel by joining through `journey_id`

## Out of scope

EPIC 11 does not implement:

- Hotmart/Kiwify webhook adapters
- payment gateway authentication
- attribution models
- dashboard/query API
- Funnel Builder UI
- buyer PII storage
