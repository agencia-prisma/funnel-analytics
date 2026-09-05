import { describe, expect, it } from 'vitest';

import { CommerceEngineError, evaluateCommerce } from './index';

const base = {
  workspaceId: '71000000-0000-4000-8000-000000000001',
  journeyId: '71000000-0000-4000-8000-000000000002',
  personId: null,
  testMode: false,
};

function event(input: {
  id: string;
  at: string;
  name: string;
  properties?: Record<string, unknown>;
}) {
  return {
    event_id: input.id,
    session_id: '71000000-0000-4000-8000-000000000010',
    visitor_id: '71000000-0000-4000-8000-000000000011',
    pixel_id: '71000000-0000-4000-8000-000000000012',
    occurred_at: input.at,
    received_at: input.at,
    event_name: 'custom_event',
    custom_event_name: input.name,
    test_mode: false,
    properties: input.properties ?? {},
  };
}

describe('commerce engine', () => {
  it('materializes checkout, purchase, items and partial refund deterministically', () => {
    const result = evaluateCommerce({
      ...base,
      events: [
        event({
          id: '71000000-0000-4000-8000-000000000101',
          at: '2026-09-05T10:00:00.000Z',
          name: 'checkout_started',
          properties: {
            checkout_id: 'checkout-1',
            provider: 'custom',
            currency: 'brl',
            value_minor: 14990,
          },
        }),
        event({
          id: '71000000-0000-4000-8000-000000000102',
          at: '2026-09-05T10:01:00.000Z',
          name: 'purchase',
          properties: {
            provider: 'custom',
            order_id: 'order-1',
            currency: 'BRL',
            value_minor: 14990,
            discount_minor: 1000,
            shipping_minor: 0,
            tax_minor: 0,
            items: [
              {
                item_id: 'sku-1',
                name: 'Produto',
                quantity: 2,
                unit_price_minor: 7495,
              },
            ],
          },
        }),
        event({
          id: '71000000-0000-4000-8000-000000000103',
          at: '2026-09-05T10:02:00.000Z',
          name: 'refund',
          properties: {
            provider: 'custom',
            order_id: 'order-1',
            currency: 'BRL',
            refund_minor: 5000,
          },
        }),
      ],
    });

    expect(result.checkouts).toHaveLength(1);
    expect(result.items).toEqual([
      expect.objectContaining({
        order_id: 'order-1',
        item_id: 'sku-1',
        quantity: 2,
        line_total_minor: 14990,
      }),
    ]);
    expect(result.revenue).toEqual([
      expect.objectContaining({
        order_id: 'order-1',
        status: 'partially_refunded',
        gross_amount_minor: 14990,
        refunded_amount_minor: 5000,
        net_amount_minor: 9990,
      }),
    ]);
  });

  it('ignores materially identical duplicate purchase events for the same order', () => {
    const props = {
      provider: 'custom',
      order_id: 'order-1',
      currency: 'BRL',
      value_minor: 10000,
    };
    const result = evaluateCommerce({
      ...base,
      events: [
        event({
          id: '71000000-0000-4000-8000-000000000111',
          at: '2026-09-05T10:00:00.000Z',
          name: 'purchase',
          properties: props,
        }),
        event({
          id: '71000000-0000-4000-8000-000000000112',
          at: '2026-09-05T10:00:01.000Z',
          name: 'purchase',
          properties: props,
        }),
      ],
    });
    expect(result.revenue).toHaveLength(1);
  });

  it('rejects conflicting purchases for the same provider/order id', () => {
    expect(() =>
      evaluateCommerce({
        ...base,
        events: [
          event({
            id: '71000000-0000-4000-8000-000000000121',
            at: '2026-09-05T10:00:00.000Z',
            name: 'purchase',
            properties: {
              order_id: 'order-1',
              currency: 'BRL',
              value_minor: 10000,
            },
          }),
          event({
            id: '71000000-0000-4000-8000-000000000122',
            at: '2026-09-05T10:00:01.000Z',
            name: 'purchase',
            properties: {
              order_id: 'order-1',
              currency: 'BRL',
              value_minor: 12000,
            },
          }),
        ],
      }),
    ).toThrowError(new CommerceEngineError('COMMERCE_ORDER_CONFLICT'));
  });

  it('rejects refunds that exceed the purchase amount', () => {
    expect(() =>
      evaluateCommerce({
        ...base,
        events: [
          event({
            id: '71000000-0000-4000-8000-000000000131',
            at: '2026-09-05T10:00:00.000Z',
            name: 'purchase',
            properties: {
              order_id: 'order-1',
              currency: 'BRL',
              value_minor: 10000,
            },
          }),
          event({
            id: '71000000-0000-4000-8000-000000000132',
            at: '2026-09-05T10:00:01.000Z',
            name: 'refund',
            properties: {
              order_id: 'order-1',
              refund_minor: 10001,
            },
          }),
        ],
      }),
    ).toThrowError(new CommerceEngineError('COMMERCE_REFUND_EXCEEDS_PURCHASE'));
  });

  it('rejects duplicate event ids', () => {
    const duplicate = event({
      id: '71000000-0000-4000-8000-000000000141',
      at: '2026-09-05T10:00:00.000Z',
      name: 'purchase',
      properties: { order_id: 'order-1', currency: 'BRL', value_minor: 100 },
    });
    expect(() =>
      evaluateCommerce({ ...base, events: [duplicate, duplicate] }),
    ).toThrowError(new CommerceEngineError('COMMERCE_EVENT_DUPLICATE'));
  });

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

});
