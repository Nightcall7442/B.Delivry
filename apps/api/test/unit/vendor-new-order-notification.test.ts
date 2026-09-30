/**
 * The seller app rings while it is open; when the phone is in a pocket the new order has to reach
 * the stall another way. The vendor of the stall gets a `store.new_order` notification the moment an
 * order is placed — Telegram once the bot is linked, the in-app list always.
 */
import { describe, expect, it } from 'vitest';
import { InProcessEventBus, createEvent } from '../../src/events/event-bus.js';
import { registerOrderNotificationHandlers } from '../../src/events/handlers/order-notifications.handler.js';
import { runWithContext } from '../../src/common/tenant/tenant-context.js';
import { systemContext } from '../../src/common/types/request-context.js';
import { ORDER_EVENT } from '../../src/modules/orders/domain/order.events.js';

function setup(vendorUsers: Record<string, string>) {
  const logger = { error() {}, warn() {}, info() {}, debug() {} };
  const events = new InProcessEventBus(logger as never);
  const jobs: { name: string; payload: Record<string, unknown>; options: { jobId?: string } }[] =
    [];
  registerOrderNotificationHandlers(
    events,
    {
      async enqueue(
        _queue: string,
        name: string,
        payload: unknown,
        options: { jobId?: string } = {},
      ) {
        jobs.push({ name, payload: payload as Record<string, unknown>, options });
      },
    } as never,
    {
      orders: {},
      notifications: {},
      vendorUserOf: async (storeId: string) => vendorUsers[storeId] ?? null,
    } as never,
  );
  const place = (storeId: string) =>
    runWithContext(systemContext('t1', 'r1', 'ru'), () =>
      events.publish(
        createEvent(ORDER_EVENT.CREATED, {
          orderId: 'o1',
          number: 'BZ-260930-ABC',
          customerId: 'c1',
          storeId,
          cityId: 'city',
          total: 43_107_00,
          currency: 'UZS',
          paymentMethod: 'CASH',
          itemCount: 3,
        } as never),
      ),
    );
  return { jobs, place };
}

describe('new order → the stall’s vendor', () => {
  it('is notified, once per order, with the number and the count', async () => {
    const { jobs, place } = setup({ st1: 'vendor-user' });
    await place('st1');
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      name: 'send-notification',
      payload: {
        tenantId: 't1',
        userId: 'vendor-user',
        template: 'store.new_order',
        params: { orderNumber: 'BZ-260930-ABC', itemCount: 3 },
        orderId: 'o1',
        deepLink: '/order/o1',
      },
      options: { jobId: 'notify:o1:store-new' },
    });
  });

  it('is skipped when the stall has no vendor user, without failing the order', async () => {
    const { jobs, place } = setup({});
    await place('ghost');
    expect(jobs).toEqual([]);
  });

  it('reaches the customer notifications too (the two reactions do not collide)', async () => {
    const { jobs, place } = setup({ st1: 'vendor-user' });
    await place('st1');
    expect(jobs.every((job) => job.payload.userId === 'vendor-user')).toBe(true);
  });
});
