/**
 * «Нет у продавца» does not fail the order. When the courier reports a line short or not at all,
 * the bill goes down (orders-delivery-courier-orders covers who may and by how much); here is what
 * follows. The customer and the stall hear what was not there. Money already taken above the new
 * total goes back to the balance — the gateways cannot return part of a payment — and only once:
 * the bill is read fresh and the claim is a compare-and-set, so two corrections at the same moment
 * (a double tap) do not both pay. A cancelled order returns what is still held, not the bill: a
 * part paid back earlier, by a missing line or by the desk, is not paid twice.
 *
 * Real PaymentsService (refundOverpayment, refundRemainder) and the real guarantee handler; the
 * repository, the wallet, the orders and the queue are fakes.
 */
import { money } from '@bazar/payments';
import { describe, expect, it } from 'vitest';
import { runWithContext } from '../../src/common/tenant/tenant-context.js';
import { systemContext } from '../../src/common/types/request-context.js';
import type { DomainEvent, EventBus, EventHandler } from '../../src/events/event-bus.js';
import type { EventName } from '../../src/events/event-types.js';
import { registerOrderGuaranteeHandlers } from '../../src/events/handlers/order-guarantee.handler.js';
import { ORDER_EVENT } from '../../src/modules/orders/domain/order.events.js';
import { PaymentsService } from '../../src/modules/payments/service/payments.service.js';

const TENANT = 't1';
const logger = { error() {}, warn() {}, info() {}, debug() {} };
const asPlatform = systemContext(TENANT, 'job', 'uz');

// ---------------------------------------------------------------- PaymentsService

interface Row {
  id: string;
  status: string;
  amount: number;
  refundedAmount: number;
}

/** One order's payments, the order's current total, and a wallet that records credits. */
function payments(rows: Omit<Row, 'id'>[], orderTotal: { value: number }) {
  const held: Row[] = rows.map((row, i) => ({ id: `pay-${i}`, ...row }));
  const credits: number[] = [];
  const published: { name: string; payload: Record<string, unknown> }[] = [];
  const svc = new PaymentsService({
    logger,
    events: {
      async publish(event: { name: string; payload: Record<string, unknown> }) {
        published.push(event);
      },
    },
    prisma: {},
    repository: {
      // A snapshot, as a read from the database is: two readers see the same row.
      async findBySubject() {
        return held.map((row) => ({
          ...row,
          tenantId: TENANT,
          orderId: 'o1',
          subject: 'o1',
          customerId: 'cust-1',
          currency: 'UZS',
          purpose: 'ORDER',
          method: 'ONLINE',
          provider: 'payme',
        }));
      },
      async claimRefundFrom(id: string, seen: number, amount: number) {
        const row = held.find((p) => p.id === id);
        if (row === undefined || row.refundedAmount !== seen) return false;
        row.refundedAmount += amount;
        return true;
      },
      async releaseRefund(id: string, amount: number) {
        const row = held.find((p) => p.id === id);
        if (row) row.refundedAmount -= amount;
      },
      async customerUserId() {
        return 'user-1';
      },
      async updateStatus(id: string, status: string) {
        const row = held.find((p) => p.id === id);
        if (row) row.status = status;
        return { ...row, orderId: 'o1', subject: 'o1', customerId: 'cust-1', currency: 'UZS' };
      },
    },
    orders: {
      async get() {
        return { id: 'o1', total: orderTotal.value };
      },
    },
    providers: new Map(),
    defaultProvider: 'payme',
  } as never);
  // The ledger is tested with payments; here it is the list of what reached the balance.
  svc.creditWallet = async (entry: { amount: { amount: number } }) => {
    credits.push(entry.amount.amount);
  };
  const run = <T>(fn: () => Promise<T>) => runWithContext(asPlatform, fn);
  return { svc, held, credits, published, run };
}

describe('paying back what was paid for and not bought', () => {
  it('returns to the balance what was taken above the bill as it stands now', async () => {
    const total = { value: 80_000 };
    const { svc, held, credits, published, run } = payments(
      [
        { status: 'FAILED', amount: 100_000, refundedAmount: 0 },
        { status: 'CAPTURED', amount: 100_000, refundedAmount: 0 },
      ],
      total,
    );
    expect(await run(() => svc.refundOverpayment('o1'))).toEqual(money(20_000, 'UZS'));
    expect(credits).toEqual([20_000]);
    expect(held[1]).toMatchObject({ refundedAmount: 20_000, status: 'PARTIALLY_REFUNDED' });
    // The order's status and the customer's message follow from the payment's own event.
    expect(published).toEqual([
      expect.objectContaining({
        name: 'payment.refunded',
        payload: expect.objectContaining({ refundedAmount: 20_000, full: false }),
      }),
    ]);
  });

  it('pays once when two corrections land at the same moment', async () => {
    const { svc, held, credits, run } = payments(
      [{ status: 'CAPTURED', amount: 100_000, refundedAmount: 0 }],
      { value: 80_000 },
    );
    await Promise.all([
      run(() => svc.refundOverpayment('o1')),
      run(() => svc.refundOverpayment('o1')),
    ]);
    expect(credits).toEqual([20_000]);
    expect(held[0]?.refundedAmount).toBe(20_000);
  });

  it('measures each later correction against what was already returned', async () => {
    const total = { value: 80_000 };
    const { svc, credits, run } = payments(
      [{ status: 'CAPTURED', amount: 100_000, refundedAmount: 0 }],
      total,
    );
    await run(() => svc.refundOverpayment('o1'));
    expect(await run(() => svc.refundOverpayment('o1'))).toBeNull();
    total.value = 70_000;
    await run(() => svc.refundOverpayment('o1'));
    expect(credits).toEqual([20_000, 10_000]);
  });

  it('does nothing when nothing was taken yet, or the bill did not go down', async () => {
    const unpaid = payments([{ status: 'PENDING', amount: 100_000, refundedAmount: 0 }], {
      value: 80_000,
    });
    expect(await unpaid.run(() => unpaid.svc.refundOverpayment('o1'))).toBeNull();
    const heavier = payments([{ status: 'CAPTURED', amount: 100_000, refundedAmount: 0 }], {
      value: 110_000,
    });
    expect(await heavier.run(() => heavier.svc.refundOverpayment('o1'))).toBeNull();
    expect([...unpaid.credits, ...heavier.credits]).toEqual([]);
  });

  it('a cancelled order returns what is still held, not the bill', async () => {
    // 20 000 already went back for a missing line (or the desk returned part of it): the rest is
    // what is left, never the whole bill again.
    const { svc, credits, held, run } = payments(
      [{ status: 'PARTIALLY_REFUNDED', amount: 100_000, refundedAmount: 20_000 }],
      { value: 100_000 },
    );
    expect(await run(() => svc.refundRemainder('o1', 'order cancelled'))).toEqual(
      money(80_000, 'UZS'),
    );
    expect(credits).toEqual([80_000]);
    expect(held[0]).toMatchObject({ refundedAmount: 100_000, status: 'REFUNDED' });
    // And never twice.
    expect(await run(() => svc.refundRemainder('o1', 'order cancelled'))).toBeNull();
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

function guarantee() {
  const events = bus();
  const jobs: Record<string, unknown>[] = [];
  const calls: string[] = [];
  registerOrderGuaranteeHandlers(events, {
    orders: {},
    payments: {
      async refundOverpayment(orderId: string) {
        calls.push(`overpayment:${orderId}`);
        return money(15_000_00, 'UZS');
      },
      async refundRemainder(orderId: string, reason: string) {
        calls.push(`remainder:${orderId}:${reason}`);
        return null;
      },
    },
    queue: {
      async enqueue(_queue: string, _job: string, payload: Record<string, unknown>) {
        jobs.push(payload);
      },
    },
    vendorUserOf: async () => 'user-stall',
  } as never);
  return { events, jobs, calls };
}

describe('the customer and the stall, when something was not there', () => {
  it('both hear what was not there and the new total; the money is the payment’s to tell', async () => {
    const { events, jobs, calls } = guarantee();
    await events.publish(
      repriced([
        { orderItemId: 'i1', name: { ru: 'Укроп', uz: 'Shivit' }, quantity: 0 },
        { orderItemId: 'i2', name: { ru: 'Лепёшка' }, quantity: 2 },
      ]),
    );
    const params = {
      orderNumber: 'BZ-1',
      items: 'Укроп, Лепёшка',
      total: 85_000,
      currency: 'UZS',
    };
    expect(jobs).toEqual([
      expect.objectContaining({ template: 'order.items_missing', userId: 'cust-1', params }),
      expect.objectContaining({ template: 'order.items_missing', userId: 'user-stall', params }),
    ]);
    expect(calls).toEqual(['overpayment:o1']);
  });

  it('a lighter weighing alone is no shortage: no message, only the money if any', async () => {
    const { events, jobs, calls } = guarantee();
    await events.publish(repriced([]));
    expect(jobs).toEqual([]);
    expect(calls).toEqual(['overpayment:o1']);
  });

  it('a cancelled or failed order returns what is still held', async () => {
    const { events, calls } = guarantee();
    for (const to of ['CANCELLED', 'FAILED', 'DELIVERED']) {
      await events.publish({
        id: `e-${to}`,
        name: ORDER_EVENT.STATUS_CHANGED,
        tenantId: TENANT,
        at: new Date(),
        payload: { orderId: 'o1', to },
      } as never);
    }
    expect(calls).toEqual(['remainder:o1:order cancelled', 'remainder:o1:order failed']);
  });
});
