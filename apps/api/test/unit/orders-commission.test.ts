/**
 * The platform's cut is fixed on the order when it is placed: the vendor's own rate when the desk
 * agreed one, else the rate of the tariff the order was priced on. The payout subtracts it order by
 * order (vendor-payout-hold), so a later change of rate — a new tariff, a deal with the stall —
 * does not reach back into money already earned. Before, only a vendor's own rate was ever
 * subtracted: a stall on the tariff was shown, and owed, its whole subtotal.
 *
 * Real OrdersService.create and StoresService.getOpenStore over fakes.
 */
import { effectivePermissions } from '@bazar/auth';
import { PAYMENT_METHOD } from '@bazar/constants';
import { money } from '@bazar/payments';
import { describe, expect, it } from 'vitest';
import { runWithContext } from '../../src/common/tenant/tenant-context.js';
import { systemContext } from '../../src/common/types/request-context.js';
import { OrdersService } from '../../src/modules/orders/service/orders.service.js';
import { StoresService } from '../../src/modules/stores/service/stores.service.js';

const logger = { error() {}, warn() {}, info() {}, debug() {} };
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

/** Places one order at a stall whose vendor has `own` as its rate, on a tariff of `tariff` %. */
async function place(own: number | null, tariff: number) {
  const written: Record<string, unknown>[] = [];
  const sum = money(20_000_00, 'UZS');
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
      async create(data: Record<string, unknown>) {
        written.push(data);
        return { id: 'o1', number: data['number'], customerId: 'cust-1', storeId: 'st1' };
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
              slug: 'pomidory',
              name: { ru: 'Помидоры' },
              unit: 'KG',
              price: 20_000_00,
              currency: 'UZS',
              stock: null,
              weightGrams: null,
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
          minOrder: null,
          freeDeliveryThreshold: null,
          currency: 'UZS',
          commissionPercent: own,
        };
      },
    },
    addresses: {
      async getFrozen() {
        return { cityId: 'c1', lat: 41.3, lng: 69.2, formatted: 'ул. Навои, 12' };
      },
    },
    pricing: {
      async quote() {
        return {
          deliverable: true,
          reason: null,
          distanceMeters: 2_000,
          subtotal: sum,
          deliveryFee: money(0, 'UZS'),
          courierFee: money(10_000_00, 'UZS'),
          serviceFee: money(0, 'UZS'),
          discount: money(0, 'UZS'),
          total: sum,
          commission: money(Math.round((sum.amount * tariff) / 100), 'UZS'),
          commissionPercent: tariff,
        };
      },
    },
    promotions: {},
    logger,
    events: { async publish() {} },
    autoConfirm: async () => false,
  } as never);
  await runWithContext(asCustomer, () =>
    svc.create({
      storeId: 'st1',
      addressId: 'addr-1',
      paymentMethod: PAYMENT_METHOD.CASH,
      items: [{ productId: 'p1', quantity: 1 }],
    } as never),
  );
  return written[0];
}

describe('the cut fixed on the order', () => {
  it('is the tariff’s when the vendor has no rate of its own', async () => {
    expect(await place(null, 10)).toMatchObject({ commissionPercent: 10 });
  });

  it('is the vendor’s own when the desk agreed one — zero included', async () => {
    expect(await place(5, 10)).toMatchObject({ commissionPercent: 5 });
    // A promotional zero is a rate, not «none»: it must not fall through to the tariff.
    expect(await place(0, 10)).toMatchObject({ commissionPercent: 0 });
  });
});

describe('the stall the order is placed at', () => {
  function stores(vendor: { status: string; commissionPercent: number | null } | null) {
    const allDay = Array.from({ length: 8 }, (_, weekday) => ({
      weekday,
      opensAt: 0,
      closesAt: 1440,
      closed: false,
    }));
    return new StoresService({
      prisma: {},
      repository: {
        async findById() {
          return {
            id: 'st1',
            tenantId: 't1',
            vendorId: 'v1',
            type: 'BAZAAR_STALL',
            status: 'ACTIVE',
            name: { ru: 'Лавка' },
            cityId: 'c1',
            lat: 41.32,
            lng: 69.23,
            preparationMinutes: 15,
            minOrder: null,
            freeDeliveryThreshold: null,
            schedule: allDay,
            deletedAt: null,
          };
        },
        async vendorTerms() {
          return {
            shut: vendor !== null && ['SUSPENDED', 'REJECTED'].includes(vendor.status),
            commissionPercent: vendor?.commissionPercent ?? null,
          };
        },
      },
      logger,
      events: { async publish() {} },
    } as never);
  }

  it('brings the vendor’s own rate along, or none for the tariff’s', async () => {
    const ctx = systemContext('t1', 'r1', 'ru');
    await expect(
      runWithContext(ctx, () =>
        stores({ status: 'ACTIVE', commissionPercent: 7 }).getOpenStore('st1'),
      ),
    ).resolves.toMatchObject({ commissionPercent: 7 });
    await expect(
      runWithContext(ctx, () =>
        stores({ status: 'ACTIVE', commissionPercent: null }).getOpenStore('st1'),
      ),
    ).resolves.toMatchObject({ commissionPercent: null });
  });
});
