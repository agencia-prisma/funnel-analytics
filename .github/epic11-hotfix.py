from pathlib import Path

source = Path('packages/commerce-engine/src/index.ts')
text = source.read_text()
old = """function commerceName(
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
"""
new = """function isCommerceEventName(
  value: string | null,
): value is CommerceEventNameV1 {
  return (
    value === 'checkout_started' ||
    value === 'purchase' ||
    value === 'refund' ||
    value === 'order_cancelled'
  );
}

function commerceName(
  event: CommerceSourceEventV1,
): CommerceEventNameV1 | null {
  if (isCommerceEventName(event.event_name)) {
    return event.event_name;
  }

  return event.event_name === 'custom_event' &&
    isCommerceEventName(event.custom_event_name)
    ? event.custom_event_name
    : null;
}
"""
if old in text:
    source.write_text(text.replace(old, new, 1))
elif new not in text:
    raise SystemExit('commerceName target block not found')

tests = Path('packages/commerce-engine/src/index.test.ts')
test_text = tests.read_text()
test_name = "accepts normalized commerce event names persisted by the event pipeline"
if test_name not in test_text:
    marker = '\n});\n'
    idx = test_text.rfind(marker)
    if idx == -1:
        raise SystemExit('test suite closing marker not found')
    regression = r'''

  it('accepts normalized commerce event names persisted by the event pipeline', () => {
    const normalized = (
      id: string,
      at: string,
      name: 'checkout_started' | 'purchase' | 'refund' | 'order_cancelled',
      properties: Record<string, unknown>,
    ) => ({
      ...event({ id, at, name, properties }),
      event_name: name,
      custom_event_name: name,
    });

    const result = evaluateCommerce({
      ...base,
      events: [
        normalized(
          '71000000-0000-4000-8000-000000000151',
          '2026-09-05T10:00:00.000Z',
          'checkout_started',
          {
            checkout_id: 'checkout-normalized',
            provider: 'custom',
            currency: 'BRL',
            value_minor: 10000,
          },
        ),
        normalized(
          '71000000-0000-4000-8000-000000000152',
          '2026-09-05T10:01:00.000Z',
          'purchase',
          {
            provider: 'custom',
            order_id: 'order-normalized',
            currency: 'BRL',
            value_minor: 10000,
          },
        ),
        normalized(
          '71000000-0000-4000-8000-000000000153',
          '2026-09-05T10:02:00.000Z',
          'refund',
          {
            provider: 'custom',
            order_id: 'order-normalized',
            currency: 'BRL',
            refund_minor: 2500,
          },
        ),
        normalized(
          '71000000-0000-4000-8000-000000000154',
          '2026-09-05T10:03:00.000Z',
          'order_cancelled',
          {
            provider: 'custom',
            order_id: 'order-normalized',
          },
        ),
      ],
    });

    expect(result.checkouts).toHaveLength(1);
    expect(result.revenue).toEqual([
      expect.objectContaining({
        order_id: 'order-normalized',
        status: 'cancelled',
        refunded_amount_minor: 2500,
        net_amount_minor: 7500,
      }),
    ]);
  });
'''
    tests.write_text(test_text[:idx] + regression + test_text[idx:])
