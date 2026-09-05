export const COMMERCE_MAX_EVENTS_PER_RECOMPUTE = 100_000;
export const COMMERCE_MAX_ITEMS_PER_ORDER = 500;

export type CommerceEventNameV1 =
  'checkout_started' | 'purchase' | 'refund' | 'order_cancelled';

export type CommerceOrderStatusV1 =
  'paid' | 'partially_refunded' | 'refunded' | 'cancelled';

export type CommerceEngineErrorCode =
  | 'COMMERCE_INPUT_INVALID'
  | 'COMMERCE_EVENT_INVALID'
  | 'COMMERCE_EVENT_DUPLICATE'
  | 'COMMERCE_ORDER_CONFLICT'
  | 'COMMERCE_REFUND_EXCEEDS_PURCHASE'
  | 'COMMERCE_INPUT_TOO_LARGE';

export class CommerceEngineError extends Error {
  constructor(readonly code: CommerceEngineErrorCode) {
    super(code);
    this.name = 'CommerceEngineError';
  }
}

export interface CommerceSourceEventV1 {
  event_id: string;
  session_id: string;
  visitor_id: string;
  pixel_id: string;
  occurred_at: string;
  received_at: string;
  event_name: string;
  custom_event_name: string | null;
  test_mode: boolean;
  properties: Record<string, unknown>;
}

export interface CommerceCheckoutFactDraft {
  workspace_id: string;
  journey_id: string;
  person_id: string | null;
  checkout_id: string;
  provider: string;
  currency: string;
  value_minor: number | null;
  event_id: string;
  occurred_at: string;
  test_mode: boolean;
}

export interface CommerceRevenueFactDraft {
  workspace_id: string;
  journey_id: string;
  person_id: string | null;
  provider: string;
  order_id: string;
  currency: string;
  status: CommerceOrderStatusV1;
  purchase_event_id: string;
  purchased_at: string;
  last_event_at: string;
  gross_amount_minor: number;
  discount_amount_minor: number;
  shipping_amount_minor: number;
  tax_amount_minor: number;
  refunded_amount_minor: number;
  net_amount_minor: number;
  item_count: number;
  quantity: number;
  test_mode: boolean;
}

export interface CommerceItemFactDraft {
  workspace_id: string;
  journey_id: string;
  person_id: string | null;
  provider: string;
  order_id: string;
  item_key: string;
  item_id: string | null;
  item_name: string | null;
  quantity: number;
  unit_price_minor: number;
  line_total_minor: number;
  currency: string;
  test_mode: boolean;
}

export interface CommerceEvaluationResult {
  checkouts: CommerceCheckoutFactDraft[];
  revenue: CommerceRevenueFactDraft[];
  items: CommerceItemFactDraft[];
}

export interface EvaluateCommerceInput {
  workspaceId: string;
  journeyId: string;
  personId: string | null;
  testMode: boolean;
  events: CommerceSourceEventV1[];
}

interface PurchaseState {
  revenue: CommerceRevenueFactDraft;
  items: CommerceItemFactDraft[];
  purchaseSignature: string;
  cancelled: boolean;
  refundEventIds: Set<string>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredString(
  value: unknown,
  code: CommerceEngineErrorCode = 'COMMERCE_EVENT_INVALID',
): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new CommerceEngineError(code);
  }
  return value.trim();
}

function optionalString(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') {
    throw new CommerceEngineError('COMMERCE_EVENT_INVALID');
  }
  return value.trim() || null;
}

function money(value: unknown, defaultValue = 0): number {
  if (value === undefined || value === null) return defaultValue;
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new CommerceEngineError('COMMERCE_EVENT_INVALID');
  }
  return value as number;
}

function quantity(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new CommerceEngineError('COMMERCE_EVENT_INVALID');
  }
  return value as number;
}

function currency(value: unknown): string {
  const normalized = requiredString(value).toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) {
    throw new CommerceEngineError('COMMERCE_EVENT_INVALID');
  }
  return normalized;
}

function provider(value: unknown): string {
  if (value === undefined || value === null || value === '') return 'custom';
  const normalized = requiredString(value).toLowerCase();
  if (normalized.length > 64 || !/^[a-z0-9][a-z0-9._-]*$/.test(normalized)) {
    throw new CommerceEngineError('COMMERCE_EVENT_INVALID');
  }
  return normalized;
}

function commerceName(
  event: CommerceSourceEventV1,
): CommerceEventNameV1 | null {
  const candidate =
    event.event_name === 'purchase'
      ? 'purchase'
      : event.event_name === 'custom_event'
        ? event.custom_event_name
        : null;

  return candidate === 'checkout_started' ||
    candidate === 'purchase' ||
    candidate === 'refund' ||
    candidate === 'order_cancelled'
    ? candidate
    : null;
}

function iso(value: string): string {
  if (!Number.isFinite(Date.parse(value))) {
    throw new CommerceEngineError('COMMERCE_EVENT_INVALID');
  }
  return value;
}

function compareEvents(
  left: CommerceSourceEventV1,
  right: CommerceSourceEventV1,
) {
  const occurred = Date.parse(left.occurred_at) - Date.parse(right.occurred_at);
  if (occurred !== 0) return occurred;
  const received = Date.parse(left.received_at) - Date.parse(right.received_at);
  if (received !== 0) return received;
  return left.event_id.localeCompare(right.event_id);
}

function purchaseSignature(input: {
  currency: string;
  gross: number;
  discount: number;
  shipping: number;
  tax: number;
  items: CommerceItemFactDraft[];
}): string {
  return JSON.stringify({
    currency: input.currency,
    gross: input.gross,
    discount: input.discount,
    shipping: input.shipping,
    tax: input.tax,
    items: input.items.map((item) => ({
      item_key: item.item_key,
      item_id: item.item_id,
      item_name: item.item_name,
      quantity: item.quantity,
      unit_price_minor: item.unit_price_minor,
    })),
  });
}

function parseItems(input: {
  value: unknown;
  workspaceId: string;
  journeyId: string;
  personId: string | null;
  provider: string;
  orderId: string;
  currency: string;
  testMode: boolean;
}): CommerceItemFactDraft[] {
  if (input.value === undefined || input.value === null) return [];
  if (
    !Array.isArray(input.value) ||
    input.value.length > COMMERCE_MAX_ITEMS_PER_ORDER
  ) {
    throw new CommerceEngineError('COMMERCE_EVENT_INVALID');
  }

  return input.value.map((raw, index) => {
    if (!isRecord(raw)) {
      throw new CommerceEngineError('COMMERCE_EVENT_INVALID');
    }
    const itemQuantity = quantity(raw.quantity);
    const unitPrice = money(raw.unit_price_minor);
    const itemId = optionalString(raw.item_id);
    const itemName = optionalString(raw.name);
    const itemKey = itemId ?? `line_${index + 1}`;

    return {
      workspace_id: input.workspaceId,
      journey_id: input.journeyId,
      person_id: input.personId,
      provider: input.provider,
      order_id: input.orderId,
      item_key: itemKey,
      item_id: itemId,
      item_name: itemName,
      quantity: itemQuantity,
      unit_price_minor: unitPrice,
      line_total_minor: itemQuantity * unitPrice,
      currency: input.currency,
      test_mode: input.testMode,
    };
  });
}

function validateInput(input: EvaluateCommerceInput): void {
  if (
    !input.workspaceId ||
    !input.journeyId ||
    typeof input.testMode !== 'boolean' ||
    !Array.isArray(input.events)
  ) {
    throw new CommerceEngineError('COMMERCE_INPUT_INVALID');
  }
  if (input.events.length > COMMERCE_MAX_EVENTS_PER_RECOMPUTE) {
    throw new CommerceEngineError('COMMERCE_INPUT_TOO_LARGE');
  }
}

export function evaluateCommerce(
  input: EvaluateCommerceInput,
): CommerceEvaluationResult {
  validateInput(input);

  const seenEvents = new Set<string>();
  for (const event of input.events) {
    if (seenEvents.has(event.event_id)) {
      throw new CommerceEngineError('COMMERCE_EVENT_DUPLICATE');
    }
    seenEvents.add(event.event_id);
  }

  const checkouts: CommerceCheckoutFactDraft[] = [];
  const orders = new Map<string, PurchaseState>();
  const events = [...input.events].sort(compareEvents);

  for (const event of events) {
    if (event.test_mode !== input.testMode) continue;
    const name = commerceName(event);
    if (!name) continue;
    if (!isRecord(event.properties)) {
      throw new CommerceEngineError('COMMERCE_EVENT_INVALID');
    }

    const props = event.properties;
    const eventProvider = provider(props.provider);

    if (name === 'checkout_started') {
      const eventCurrency = currency(props.currency);
      checkouts.push({
        workspace_id: input.workspaceId,
        journey_id: input.journeyId,
        person_id: input.personId,
        checkout_id: optionalString(props.checkout_id) ?? event.event_id,
        provider: eventProvider,
        currency: eventCurrency,
        value_minor:
          props.value_minor === undefined || props.value_minor === null
            ? null
            : money(props.value_minor),
        event_id: event.event_id,
        occurred_at: iso(event.occurred_at),
        test_mode: input.testMode,
      });
      continue;
    }

    const orderId = requiredString(props.order_id);
    const key = `${eventProvider}\u0000${orderId}`;

    if (name === 'purchase') {
      const eventCurrency = currency(props.currency);
      const gross = money(props.value_minor);
      const discount = money(props.discount_minor);
      const shipping = money(props.shipping_minor);
      const tax = money(props.tax_minor);
      const itemFacts = parseItems({
        value: props.items,
        workspaceId: input.workspaceId,
        journeyId: input.journeyId,
        personId: input.personId,
        provider: eventProvider,
        orderId,
        currency: eventCurrency,
        testMode: input.testMode,
      });
      const signature = purchaseSignature({
        currency: eventCurrency,
        gross,
        discount,
        shipping,
        tax,
        items: itemFacts,
      });
      const existing = orders.get(key);
      if (existing) {
        if (existing.purchaseSignature !== signature) {
          throw new CommerceEngineError('COMMERCE_ORDER_CONFLICT');
        }
        continue;
      }
      const totalQuantity = itemFacts.reduce(
        (sum, item) => sum + item.quantity,
        0,
      );
      orders.set(key, {
        purchaseSignature: signature,
        cancelled: false,
        refundEventIds: new Set(),
        items: itemFacts,
        revenue: {
          workspace_id: input.workspaceId,
          journey_id: input.journeyId,
          person_id: input.personId,
          provider: eventProvider,
          order_id: orderId,
          currency: eventCurrency,
          status: 'paid',
          purchase_event_id: event.event_id,
          purchased_at: iso(event.occurred_at),
          last_event_at: iso(event.occurred_at),
          gross_amount_minor: gross,
          discount_amount_minor: discount,
          shipping_amount_minor: shipping,
          tax_amount_minor: tax,
          refunded_amount_minor: 0,
          net_amount_minor: gross,
          item_count: itemFacts.length,
          quantity: totalQuantity,
          test_mode: input.testMode,
        },
      });
      continue;
    }

    const order = orders.get(key);
    if (!order) {
      throw new CommerceEngineError('COMMERCE_ORDER_CONFLICT');
    }

    if (name === 'refund') {
      if (order.refundEventIds.has(event.event_id)) continue;
      if (
        props.currency !== undefined &&
        currency(props.currency) !== order.revenue.currency
      ) {
        throw new CommerceEngineError('COMMERCE_ORDER_CONFLICT');
      }
      const amount = money(props.refund_minor);
      const refunded = order.revenue.refunded_amount_minor + amount;
      if (refunded > order.revenue.gross_amount_minor) {
        throw new CommerceEngineError('COMMERCE_REFUND_EXCEEDS_PURCHASE');
      }
      order.refundEventIds.add(event.event_id);
      order.revenue.refunded_amount_minor = refunded;
      order.revenue.net_amount_minor =
        order.revenue.gross_amount_minor - refunded;
      order.revenue.status =
        refunded === order.revenue.gross_amount_minor
          ? 'refunded'
          : 'partially_refunded';
      order.revenue.last_event_at = iso(event.occurred_at);
      continue;
    }

    order.cancelled = true;
    order.revenue.status = 'cancelled';
    order.revenue.last_event_at = iso(event.occurred_at);
  }

  return {
    checkouts,
    revenue: [...orders.values()].map((order) => order.revenue),
    items: [...orders.values()].flatMap((order) => order.items),
  };
}
