/**
 * An order is charged as it was quoted. `quote` priced the delivery with the stall's own minimum
 * and free-delivery threshold and the goods' weight; `create` left all three out — a basket over
 * the stall's threshold (and under the zone's) was shown free delivery and charged the zone fee, a
 * car surcharge was shown and not charged. And the tariff of the city is found before the global
 * one: Postgres sorts NULLs first in a descending order, so the global tariff won.
 *
 * Real OrdersService.create and PricingRepository over fakes.
 */
import { effectivePermissions } from '@bazar/auth';
import { PAYMENT_METHOD } from '@bazar/constants';
import { money } from '@bazar/payments';
import { describe, expect, it } from 'vitest';
import { runWithContext } from '../../src/common/tenant/tenant-context.js';
import { systemContext } from '../../src/common/types/request-context.js';
import { OrdersService } from '../../src/modules/orders/service/orders.service.js';
import { PricingRepository } from '../../src/modules/pricing/repository/pricing.repository.js';

const asCustomer = {
  ...systemContext('t1', 'r1', 'ru'),
  system: undefined,
  user: {
    id: 'user-1',
    tenantId: 't1',
    roles: ['CUSTOMER'],
    permissions: effectivePermissions(['CUSTOMER'] as never),
    customerId: 'cust-1',
  },
} as never;

describe('an order is charged as quoted', () => {
  it('prices the delivery with the stall’s own limits and the goods’ weight', async () => {
    const asked: Record<string, unknown>[] = [];
    const svc = new OrdersService({
      prisma: {
        customer: {
          async findFirst() {
            return { blockedAt: null };
          },
          async findUnique() {
            return { plusUntil: null };
          },
        },
        async $transaction<T>(fn: (tx: unknown) => Promise<T>) {
          return fn({});
        },
      },
      repository: {
        async create() {
          return { id: 'o1', number: 'BZ-1', customerId: 'cust-1', storeId: 'st1' };
        },
      },
      cart: {},
      catalog: {
        async getPurchasable() {
          return new Map([
            [
              'p1',
              {
                id: 'p1',
                slug: 'muka',
                name: { ru: 'Мука' },
                unit: 'PCS',
                price: 150_000_00,
                currency: 'UZS',
                stock: null,
                // A 25 kg sack.
                weightGrams: 25_000,
                priceTiers: [],
              },
            ],
          ]);
        },
      },
      haggle: {
        async agreedPrices() {
          return new Map();
        },
      },
      stores: {
        async getOpenStore() {
          return {
            id: 'st1',
            vendorId: 'v1',
            lat: 41.32,
            lng: 69.23,
            preparationMinutes: 15,
            minOrder: 50_000_00,
            freeDeliveryThreshold: 100_000_00,
            currency: 'UZS',
            commissionPercent: null,
          };
        },
      },
      addresses: {
        async getFrozen() {
          return { cityId: 'c1', lat: 41.3, lng: 69.2, formatted: 'ул. Навои, 12' };
        },
      },
      pricing: {
        async quote(request: Record<string, unknown>) {
          asked.push(request);
          const subtotal = request['subtotal'] as ReturnType<typeof money>;
          return {
            deliverable: true,
            reason: null,
            distanceMeters: 2_000,
            subtotal,
            deliveryFee: money(0, 'UZS'),
            courierFee: money(0, 'UZS'),
            serviceFee: money(0, 'UZS'),
            discount: money(0, 'UZS'),
            total: subtotal,
            commission: money(0, 'UZS'),
            commissionPercent: 0,
          };
        },
      },
      promotions: {},
      logger: { error() {}, warn() {}, info() {}, debug() {} },
      events: { async publish() {} },
      autoConfirm: async () => false,
    } as never);

    await runWithContext(asCustomer, () =>
      svc.create({
        storeId: 'st1',
        addressId: 'addr-1',
        paymentMethod: PAYMENT_METHOD.CASH,
        items: [{ productId: 'p1', quantity: 2 }],
      } as never),
    );
    expect(asked[0]).toMatchObject({
      weightGrams: 50_000,
      minOrder: money(50_000_00, 'UZS'),
      freeDeliveryThreshold: money(100_000_00, 'UZS'),
    });
  });
});

describe('the tariff of a place without a zone', () => {
  it('is the city’s before the global one', async () => {
    const sent: Record<string, unknown>[] = [];
    const repository = new PricingRepository({
      tariff: {
        async findFirst(args: Record<string, unknown>) {
          sent.push(args);
          return null;
        },
      },
    } as never);
    await runWithContext(systemContext('t1', 'r1', 'ru'), () => repository.findDefaultTariff('c1'));
    expect(sent[0]?.['orderBy']).toEqual([
      { cityId: { sort: 'desc', nulls: 'last' } },
      { createdAt: 'asc' },
    ]);
  });
});
