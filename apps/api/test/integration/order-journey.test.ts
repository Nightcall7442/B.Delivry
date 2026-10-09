/**
 * The whole order, on a real database.
 *
 * A customer signs up by signing in with the code the SMS carried, saves an address, checks the
 * price and orders from a stall for cash, with a wish on one line. The stall sees it and confirms.
 * The courier search finds the courier on shift, who takes the trip, weighs the meat at the counter
 * (a little under what was ordered, so the bill goes down), carries it and hands it over. Then the
 * money is where it should be: the cash payment captured, the cashback on the customer's balance,
 * the courier's fee earned and the cash they hold owed, the stall's payout on hold for the
 * complaint window and free once it has passed.
 *
 * Then the roads off that path: the customer changes their mind, the stall cannot gather the
 * order, a line is not at the stall, the goods are gone altogether, a basket below the minimum,
 * a stranger asking for someone else's order.
 *
 * Every actor goes through @bazar/api-client, as the apps do; see ./harness.ts.
 */
import { ApiError } from '@bazar/api-client';
import { CASHBACK, ORDER_STATUS } from '@bazar/constants';
import type { CreateOrderDto, DeliveryDto, OrderDto } from '@bazar/types';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  seedWorld,
  signIn,
  startApi,
  testDatabase,
  waitFor,
  type Api,
  type Client,
  type World,
} from './harness.js';

const db = testDatabase();

/** The error the API answered with: its HTTP status and code. */
async function refusal(promise: Promise<unknown>): Promise<{ status: number; code: string }> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ApiError) return { status: error.status, code: error.code };
    throw error;
  }
  throw new Error('the API accepted what it should have refused');
}

describe.skipIf('skip' in db)(
  `an order from the stall to the door${'skip' in db ? ` (skipped: ${db.skip})` : ''}`,
  () => {
    let api: Api;
    let world: World;
    let customer: Client;
    let vendor: Client;
    let courier: Client;
    let addressId: string;

    beforeAll(async () => {
      if ('skip' in db) return;
      api = await startApi(db.url);
      world = await seedWorld(api.prisma);
      [customer, vendor, courier] = await Promise.all([
        signIn(api, world.slug, world.customerPhone),
        signIn(api, world.slug, world.vendorPhone),
        signIn(api, world.slug, world.courierPhone),
      ]);
      // On shift: what the courier app does when the shift starts.
      await courier.couriers.setStatus('ONLINE');
      const address = await customer.addresses.create({
        cityId: world.cityId,
        street: 'ул. Навои',
        house: '12',
        point: world.place.home,
      });
      addressId = address.id;
    }, 60_000);

    afterAll(async () => {
      await api?.close();
    });

    /** The customer orders these goods for cash, to their saved address. */
    const order = (items: CreateOrderDto['items']) =>
      customer.orders.create({
        storeId: world.storeId,
        addressId,
        paymentMethod: 'CASH',
        ...(items === undefined ? {} : { items }),
      });

    /**
     * The stall confirms; the courier, standing at the bazaar (the app sends the position as the
     * shift goes on), gets the offer, takes it and walks up to the counter.
     */
    async function atTheCounter(placed: OrderDto): Promise<DeliveryDto> {
      await vendor.orders.confirm(placed.id);
      await courier.http.request('POST', '/tracking/location', { body: world.place.stall });
      const offer = await waitFor('an offer to the courier', async () =>
        (await courier.delivery.offers()).find((row) => row.orderId === placed.id),
      );
      const taken = await courier.delivery.accept(offer.deliveryId);
      return courier.delivery.arrivedPickup(taken.id);
    }

    /** From the counter to the customer's hands. */
    async function handOver(trip: DeliveryDto): Promise<DeliveryDto> {
      await courier.delivery.pickedUp(trip.id);
      await courier.delivery.arrivedDropoff(trip.id);
      return courier.delivery.complete(trip.id, world.place.home);
    }

    const lineOf = (placed: OrderDto, productId: string) => {
      const line = placed.items.find((item) => item.productId === productId);
      if (line === undefined) throw new Error(`no line for ${productId}`);
      return line;
    };

    it('goes from the basket to the door, and the money lands where it should', async () => {
      // ------------------------------------------------------------------ the customer orders
      const me = await customer.customers.me();
      expect(me.phone).toBe(world.customerPhone);

      const items = [
        { productId: world.meat.id, quantity: 1.5, comment: 'без кости' },
        { productId: world.bread.id, quantity: 2 },
      ];
      const quote = await customer.orders.quote({ storeId: world.storeId, addressId, items });
      expect(quote.deliverable).toBe(true);
      // 1,5 kg × 30 000 + 2 × 5 000.
      expect(quote.totals.subtotal.amount).toBe(55_000_00);

      const placed = await order(items);
      expect(placed.status).toBe(ORDER_STATUS.PENDING);
      // The checkout showed a price; the order charges that price.
      expect(placed.totals.total.amount).toBe(quote.totals.total.amount);
      expect(lineOf(placed, world.meat.id).comment).toBe('без кости');

      // ------------------------------------------------------------------ the stall sees it
      const pile = await vendor.orders.list({ as: 'store', activeOnly: true });
      expect(pile.items.map((row) => row.id)).toContain(placed.id);

      // ------------------------------------------------------------------ a courier takes it
      const trip = await atTheCounter(placed);
      expect(trip.status).toBe('AT_PICKUP');
      expect((await customer.orders.get(placed.id)).status).toBe(
        ORDER_STATUS.COURIER_ARRIVED_PICKUP,
      );

      // At the counter: the meat weighs 1,4 kg, not 1,5 — the bill follows the scale.
      await courier.orders.actualQuantities(placed.id, [
        { orderItemId: lineOf(placed, world.meat.id).id, actualQuantity: 1.4 },
      ]);
      const weighed = await customer.orders.get(placed.id);
      expect(weighed.totals.subtotal.amount).toBe(52_000_00);
      expect(weighed.totals.total.amount).toBeLessThan(placed.totals.total.amount);

      // ------------------------------------------------------------------ to the door
      const handed = await handOver(trip);
      expect(handed.status).toBe('DELIVERED');

      const delivered = await customer.orders.get(placed.id);
      expect(delivered.status).toBe(ORDER_STATUS.DELIVERED);
      const total = delivered.totals.total.amount;

      // ------------------------------------------------------------------ the money
      // Cash changed hands at the door: that is the payment.
      await waitFor('the cash payment to be captured', async () => {
        const row = await customer.orders.get(placed.id);
        return row.paymentStatus === 'CAPTURED';
      });
      const payments = await customer.payments.forOrder(placed.id);
      expect(payments.find((payment) => payment.status === 'CAPTURED')?.amount.amount).toBe(total);

      // The customer's cashback, on what the goods came to after the scale.
      const cashback = Math.floor((52_000_00 * CASHBACK.PERCENT) / 100);
      await waitFor('the cashback on the customer balance', async () => {
        const balance = await customer.payments.balance();
        return balance.amount === cashback;
      });

      // The courier: one more trip done; the fee is theirs, the customer's cash is the platform's
      // until they settle up.
      await waitFor('the courier stats', async () => {
        const row = await courier.couriers.me();
        return row.completedOrders === 1;
      });
      await waitFor('the courier ledger', async () => {
        const balance = await courier.http.request<{ amount: number }>(
          'GET',
          '/couriers/me/balance',
        );
        return balance.amount === handed.payout.amount - total;
      });

      // The stall: everything it is owed is on hold while the customer may still complain.
      const commission = Math.round((52_000_00 * world.tariff.commissionPercent) / 100);
      const held = await vendor.vendors.payout();
      expect(held.pending).toBe(52_000_00 - commission);
      expect(held.onHold).toBe(held.pending);
      expect(held.available).toBe(0);
      expect(held.releasesAt).not.toBeNull();

      // Three days later (the clock moved on the row: nobody waits three days in a test), the
      // complaint window has closed and the money is the stall's to take.
      await api.prisma.order.update({
        where: { id: placed.id },
        data: { deliveredAt: new Date(Date.now() - 3 * 24 * 3_600_000) },
      });
      const free = await vendor.vendors.payout();
      expect(free.available).toBe(held.pending);
      expect(free.onHold).toBe(0);

      // The record of the trip: the statuses the order passed through, in that order.
      const history = await api.prisma.orderStatusHistory.findMany({
        where: { orderId: placed.id },
        orderBy: { at: 'asc' },
        select: { status: true },
      });
      const steps = [
        ORDER_STATUS.PENDING,
        ORDER_STATUS.CONFIRMED,
        ORDER_STATUS.SEARCHING_COURIER,
        ORDER_STATUS.COURIER_ASSIGNED,
        ORDER_STATUS.COURIER_ARRIVED_PICKUP,
        ORDER_STATUS.PICKED_UP,
        ORDER_STATUS.DELIVERED,
      ];
      const passed: string[] = history.map((row) => row.status);
      expect(passed.filter((status) => (steps as string[]).includes(status))).toEqual(steps);
    }, 60_000);

    it('lets the customer change their mind before the stall confirms', async () => {
      const placed = await order([{ productId: world.meat.id, quantity: 1 }]);
      const cancelled = await customer.orders.cancel(placed.id, { reason: 'Передумал' });
      expect(cancelled.status).toBe(ORDER_STATUS.CANCELLED);
      expect(cancelled.cancelReason).toBe('Передумал');

      // The stall no longer has it to gather, cannot confirm it, and no courier is looked for.
      const pile = await vendor.orders.list({ as: 'store', activeOnly: true });
      expect(pile.items.map((row) => row.id)).not.toContain(placed.id);
      expect((await refusal(vendor.orders.confirm(placed.id))).status).toBe(409);
      expect(await api.prisma.delivery.count({ where: { orderId: placed.id } })).toBe(0);
    });

    it('tells the customer when the stall cannot gather the order', async () => {
      const placed = await order([{ productId: world.meat.id, quantity: 2 }]);
      const declined = await vendor.orders.cancel(placed.id, { reason: 'Говядина закончилась' });
      expect(declined.status).toBe(ORDER_STATUS.CANCELLED);

      const seen = await customer.orders.get(placed.id);
      expect(seen.status).toBe(ORDER_STATUS.CANCELLED);
      expect(seen.cancelReason).toBe('Говядина закончилась');
      // Cash was never taken, so there is nothing to give back.
      expect(await customer.payments.forOrder(placed.id)).toEqual([]);
    });

    it('takes what the stall did not have off the bill', async () => {
      const placed = await order([
        { productId: world.meat.id, quantity: 1 },
        { productId: world.bread.id, quantity: 2 },
      ]);
      const trip = await atTheCounter(placed);
      // No bread today: the courier marks the line «нет у продавца».
      await courier.orders.actualQuantities(placed.id, [
        { orderItemId: lineOf(placed, world.bread.id).id, actualQuantity: 0 },
      ]);
      const repriced = await customer.orders.get(placed.id);
      expect(repriced.totals.subtotal.amount).toBe(30_000_00);
      expect(lineOf(repriced, world.bread.id).actualQuantity).toBe(0);

      await handOver(trip);
      const delivered = await customer.orders.get(placed.id);
      expect(delivered.status).toBe(ORDER_STATUS.DELIVERED);
      // The customer paid for the meat and the delivery, not for bread that never came.
      await waitFor('the cash payment to be captured', async () => {
        const payments = await customer.payments.forOrder(placed.id);
        return payments.find((payment) => payment.status === 'CAPTURED');
      }).then((payment) => expect(payment.amount.amount).toBe(delivered.totals.total.amount));
    });

    it('ends the order, and charges nobody, when the goods are gone altogether', async () => {
      const before = await vendor.vendors.payout();
      const placed = await order([{ productId: world.meat.id, quantity: 1 }]);
      const trip = await atTheCounter(placed);

      const failed = await courier.delivery.fail(trip.id, { reason: 'Прилавок пуст' });
      expect(failed.status).toBe('FAILED');
      const seen = await customer.orders.get(placed.id);
      expect(seen.status).toBe(ORDER_STATUS.FAILED);

      // Nothing was handed over, so nothing was paid and the stall is owed nothing more.
      expect(await customer.payments.forOrder(placed.id)).toEqual([]);
      expect((await vendor.vendors.payout()).pending).toBe(before.pending);
      // And the courier is free for the next trip.
      expect((await courier.couriers.me()).activeOrderCount).toBe(0);
    });

    it('refuses a basket below the minimum, and says why', async () => {
      // One flatbread: 5 000 against a 20 000 minimum.
      const items = [{ productId: world.bread.id, quantity: 1 }];
      const quote = await customer.orders.quote({ storeId: world.storeId, addressId, items });
      expect(quote.deliverable).toBe(false);
      expect(quote.reason).toMatch(/minimum/i);
      expect(quote.minOrder.amount).toBe(world.tariff.minOrder);

      const refused = await refusal(order(items));
      expect(refused.status).toBe(422);
    });

    it('shows an order to no one but its parties', async () => {
      const placed = await order([{ productId: world.meat.id, quantity: 1 }]);
      const stranger = await signIn(api, world.slug, world.strangerPhone);

      // Another customer of the same bazaar may neither read it, nor cancel it, nor confirm it.
      expect((await refusal(stranger.orders.get(placed.id))).status).toBe(403);
      expect((await refusal(stranger.orders.cancel(placed.id, { reason: 'чужой' }))).status).toBe(
        403,
      );
      expect((await refusal(stranger.orders.confirm(placed.id))).status).toBe(403);
      // The customer cannot confirm their own order for the stall, either.
      expect((await refusal(customer.orders.confirm(placed.id))).status).toBe(403);

      await customer.orders.cancel(placed.id, { reason: 'Проверка доступа' });
    });
  },
);
