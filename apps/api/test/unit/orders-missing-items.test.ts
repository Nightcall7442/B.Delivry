/**
 * «Нет у продавца» does not fail the order. When the courier reports a line short or not at all,
 * the bill goes down (orders-delivery-courier-orders covers who may and by how much); here is what
 * the customer gets for it: a message naming what was not there and the new total, and — when the
 * money was already taken — what was paid above that total back, the way it came, once: a second
 * correction never returns the first one's money again. A cancelled order that was partly paid
 * back still returns the rest.
 *
 * Real PaymentsService.refundOverpayment and the real guarantee handler; the repository, the
 * refund itself, the orders and the queue are fakes.
 */
import { money } from '@bazar/payments';
import { describe, expect, it } from 'vitest';
import type { DomainEvent, EventBus, EventHandler } from '../../src/events/event-bus.js';
import type { EventName } from '../../src/events/event-types.js';
import { registerOrderGuaranteeHandlers } from '../../src/events/handlers/order-guarantee.handler.js';
import { ORDER_EVENT } from '../../src/modules/orders/domain/order.events.js';
import { PaymentsService } from '../../src/modules/payments/service/payments.service.js';

const TENANT = 't1';
const logger = { error() {}, warn() {}, info() {}, debug() {} };

// ---------------------------------------------------------------- refundOverpayment

function payments(rows: { status: string; amount: number; refundedAmount: number }[]) {
  const held = rows.map((row, i) => ({ id: `pay-${i}`, currency: 'UZS', ...row }));
  const refunds: { id: string; amount: number }[] = [];
  const svc = new PaymentsService({
    logger,
    events: { async publish() {} },
    prisma: {},
    repository: {
      async findBySubject() {
        return held;
      },
    },
    orders: {},
    providers: new Map(),
    defaultProvider: 'payme',
  } as never);
  // The refund itself (provider or wallet, the claim on the amount) is tested with payments; here
  // it records, and moves the refunded amount the way the real one does.
  svc.refund = async (id: string, input: { amount?: { amount: number } | undefined }) => {
    const row = held.find((p) => p.id === id);
    if (row === undefined || input.amount === undefined) throw new Error('unexpected refund');
    row.refundedAmount += input.amount.amount;
    row.status = 'PARTIALLY_REFUNDED';
    refunds.push({ id, amount: input.amount.amount });
    return row as never;
  };
  return { svc, refunds };
}

describe('paying back what was paid for and not bought', () => {
  it('returns what was taken above the new total, from the payment that holds the money', async () => {
    const { svc, refunds } = payments([
      { status: 'FAILED', amount: 100_000, refundedAmount: 0 },
      { status: 'CAPTURED', amount: 100_000, refundedAmount: 0 },
    ]);
    expect(await svc.refundOverpayment('o1', 80_000)).toEqual(money(20_000, 'UZS'));
    expect(refunds).toEqual([{ id: 'pay-1', amount: 20_000 }]);
  });

  it('never returns the same money twice: a second correction is measured against what is held', async () => {
    const { svc, refunds } = payments([{ status: 'CAPTURED', amount: 100_000, refundedAmount: 0 }]);
    await svc.refundOverpayment('o1', 80_000);
    // Weighed again at the same total: nothing more. Lighter still: only the new difference.
    expect(await svc.refundOverpayment('o1', 80_000)).toBeNull();
    expect(await svc.refundOverpayment('o1', 70_000)).toEqual(money(10_000, 'UZS'));
    expect(refunds.map((r) => r.amount)).toEqual([20_000, 10_000]);
  });

  it('does nothing when nothing was taken yet, or the bill did not go down', async () => {
    const unpaid = payments([{ status: 'PENDING', amount: 100_000, refundedAmount: 0 }]);
    expect(await unpaid.svc.refundOverpayment('o1', 80_000)).toBeNull();
    const heavier = payments([{ status: 'CAPTURED', amount: 100_000, refundedAmount: 0 }]);
    expect(await heavier.svc.refundOverpayment('o1', 110_000)).toBeNull();
    expect([...unpaid.refunds, ...heavier.refunds]).toEqual([]);
  });
});

// ---------------------------------------------------------------- the guarantee handler

function bus() {
  const handlers = new Map<string, EventHandler<EventName>[]>();
  const events: EventBus = {
    on(name, handler) {
      handlers.set(name, [...(handlers.get(name) ?? []), handler as EventHandler<EventName>]);
    },
    async publish(event) {
      for (const handler of handlers.get(event.name) ?? []) await handler(event as never);
    },
  };
  return events;
}

const repriced = (
  missing: { orderItemId: string; name: Record<string, string>; quantity: number }[],
): DomainEvent<'order.repriced'> => ({
  id: 'e1',
  name: ORDER_EVENT.REPRICED,
  tenantId: TENANT,
  at: new Date(),
  payload: {
    orderId: 'o1',
    number: 'BZ-1',
    customerId: 'cust-1',
    storeId: 's1',
    cityId: 'c1',
    previousTotal: 100_000_00,
    total: 85_000_00,
    currency: 'UZS',
    missing,
  },
});

function guarantee(refunded: number | null, order: Record<string, unknown> = {}) {
  const events = bus();
  const jobs: Record<string, unknown>[] = [];
  const credited: unknown[] = [];
  const overpaid: { orderId: string; total: number }[] = [];
  registerOrderGuaranteeHandlers(events, {
    orders: {
      async get() {
        return {
          id: 'o1',
          total: 85_000_00,
          currency: 'UZS',
          paymentMethod: 'ONLINE',
          paymentStatus: 'PARTIALLY_REFUNDED',
          customerId: 'cust-1',
          customer: { userId: 'user-1' },
          ...order,
        };
      },
      async setPaymentStatus() {},
    },
    payments: {
      async refundOverpayment(orderId: string, total: number) {
        overpaid.push({ orderId, total });
        return refunded === null ? null : money(refunded, 'UZS');
      },
      async creditWallet(entry: unknown) {
        credited.push(entry);
      },
    },
    queue: {
      async enqueue(_queue: string, _job: string, payload: Record<string, unknown>) {
        jobs.push(payload);
      },
    },
  } as never);
  return { events, jobs, credited, overpaid };
}

describe('the customer, when the stall did not have something', () => {
  it('hears what was not there and the new total, and gets the overpaid part back', async () => {
    const { events, jobs, overpaid } = guarantee(15_000_00);
    await events.publish(
      repriced([
        { orderItemId: 'i1', name: { ru: 'Укроп', uz: 'Shivit' }, quantity: 0 },
        { orderItemId: 'i2', name: { ru: 'Лепёшка' }, quantity: 2 },
      ]),
    );
    expect(overpaid).toEqual([{ orderId: 'o1', total: 85_000_00 }]);
    expect(jobs).toEqual([
      expect.objectContaining({
        template: 'order.items_missing',
        userId: 'cust-1',
        params: {
          orderNumber: 'BZ-1',
          items: 'Укроп, Лепёшка',
          total: 85_000,
          currency: 'UZS',
        },
      }),
      expect.objectContaining({
        template: 'payment.refunded',
        params: { amount: 15_000, currency: 'UZS' },
      }),
    ]);
  });

  it('a lighter weighing alone is no shortage: no message about it, only the money if any', async () => {
    const { events, jobs } = guarantee(null);
    await events.publish(repriced([]));
    expect(jobs).toEqual([]);
  });

  it('a cancelled order that was partly paid back returns the rest', async () => {
    const { events, credited } = guarantee(null);
    await events.publish({
      id: 'e2',
      name: ORDER_EVENT.STATUS_CHANGED,
      tenantId: TENANT,
      at: new Date(),
      payload: { orderId: 'o1', to: 'CANCELLED' },
    } as never);
    expect(credited).toEqual([
      expect.objectContaining({
        userId: 'user-1',
        type: 'REFUND',
        amount: money(85_000_00, 'UZS'),
      }),
    ]);
  });
});
