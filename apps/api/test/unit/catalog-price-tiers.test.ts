/**
 * Quantity prices — «от 10 кг по 16 000» for the café buying by the sack, «3 шт за 10 000» for the
 * third melon (kept per piece). The seller sets the ladder for their own goods only, and only a
 * ladder down: from above the smallest order, each step cheaper, all under the list price, three at
 * most. An order prices the whole line at the deepest step its quantity reaches; a price agreed in
 * haggling stands where it is lower still; below the first step it is the list price. The public
 * product carries the steps, in order.
 *
 * Real ProductsService, OrdersService.create and toProductDto over fakes.
 */
import { effectivePermissions, type AuthenticatedUser } from '@bazar/auth';
import { PAYMENT_METHOD, ROLE, type Role } from '@bazar/constants';
import { money } from '@bazar/payments';
import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { ForbiddenError, ValidationError } from '../../src/common/errors/index.js';
import { toProductDto } from '../../src/common/dto/index.js';
import { runWithContext } from '../../src/common/tenant/tenant-context.js';
import { systemContext, type RequestContext } from '../../src/common/types/request-context.js';
import { OrdersService } from '../../src/modules/orders/service/orders.service.js';
import { ProductsService } from '../../src/modules/products/service/products.service.js';

const TENANT = 't1';
const logger = { error() {}, warn() {}, info() {}, debug() {} };
const som = (n: number) => money(n * 100, 'UZS');

const as = (name: string, roles: Role[], ids: Record<string, string> = {}): RequestContext => ({
  requestId: 'r1',
  tenantId: TENANT,
  locale: 'ru',
  user: {
    id: `user-${name}`,
    tenantId: TENANT,
    roles,
    permissions: effectivePermissions(roles),
    sessionId: 's1',
    locale: 'ru',
    ...ids,
  } as AuthenticatedUser,
  ip: null,
  userAgent: null,
  startedAt: new Date(),
});
const owner = as('vendor-1', [ROLE.VENDOR], { vendorId: 'vendor-1' });
const stranger = as('vendor-2', [ROLE.VENDOR], { vendorId: 'vendor-2' });

// ---------------------------------------------------------------- the seller sets them

function shelf() {
  const written: { productId: string; tiers: unknown }[] = [];
  const invalidated: string[] = [];
  const service = new ProductsService({
    repository: {
      async findById() {
        return {
          id: 'p1',
          storeId: 's1',
          price: 18_000_00,
          currency: 'UZS',
          minQuantity: new Prisma.Decimal(0.5),
          images: [],
          priceTiers: [],
        };
      },
      async setTiers(productId: string, tiers: unknown) {
        written.push({ productId, tiers });
        return { id: productId };
      },
    },
    stores: {
      async get() {
        return { id: 's1', tenantId: TENANT, vendorId: 'vendor-1' };
      },
    },
    cache: {
      async invalidateByTag(tag: string) {
        invalidated.push(tag);
      },
    },
    logger,
    events: { async publish() {} },
  } as never);
  return { service, written, invalidated };
}

describe('the seller sets quantity prices', () => {
  it('as a ladder down, all at once, and the shop window is read afresh', async () => {
    const { service, written, invalidated } = shelf();
    await runWithContext(owner, () =>
      service.setTiers('p1', [
        { minQuantity: 10, price: som(16_000) },
        { minQuantity: 5, price: som(17_000) },
      ]),
    );
    expect(written).toEqual([
      {
        productId: 'p1',
        tiers: [
          { minQuantity: 10, price: 16_000_00 },
          { minQuantity: 5, price: 17_000_00 },
        ],
      },
    ]);
    expect(invalidated).toContain('store:s1');
    // An empty list takes them off.
    await runWithContext(owner, () => service.setTiers('p1', []));
    expect(written[1]).toEqual({ productId: 'p1', tiers: [] });
  });

  it('refuses a step that is no cheaper, starts at the smallest order, or is in another currency', async () => {
    const { service, written } = shelf();
    for (const tiers of [
      [{ minQuantity: 5, price: som(18_000) }],
      [{ minQuantity: 0.5, price: som(17_000) }],
      [
        { minQuantity: 5, price: som(16_000) },
        { minQuantity: 10, price: som(17_000) },
      ],
      [{ minQuantity: 5, price: money(17_000_00, 'USD' as never) }],
    ]) {
      await expect(
        runWithContext(owner, () => service.setTiers('p1', tiers)),
      ).rejects.toBeInstanceOf(ValidationError);
    }
    expect(written).toEqual([]);
  });

  it('only on the seller’s own goods', async () => {
    const { service, written } = shelf();
    await expect(
      runWithContext(stranger, () =>
        service.setTiers('p1', [{ minQuantity: 5, price: som(17_000) }]),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(written).toEqual([]);
  });
});

// ---------------------------------------------------------------- an order prices by them

const asCustomer = {
  ...systemContext(TENANT, 'r1', 'ru'),
  system: undefined,
  user: {
    id: 'user-1',
    tenantId: TENANT,
    roles: ['CUSTOMER'],
    permissions: effectivePermissions(['CUSTOMER'] as never),
    customerId: 'cust-1',
  },
} as never;

/** Places one line of `quantity` kg of tomatoes at 18 000, 17 000 from 5 kg, 16 000 from 10 kg. */
async function place(quantity: number, haggled?: number) {
  const written: { items: { unitPrice: { amount: number }; total: { amount: number } }[] }[] = [];
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
      async create(data: never) {
        written.push(data);
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
              slug: 'pomidory',
              name: { ru: 'Помидоры' },
              unit: 'KG',
              price: 18_000_00,
              currency: 'UZS',
              stock: null,
              weightGrams: null,
              priceTiers: [
                { minQuantity: 5, price: 17_000_00 },
                { minQuantity: 10, price: 16_000_00 },
              ],
            },
          ],
        ]);
      },
    },
    haggle: {
      async agreedPrices() {
        return new Map(haggled === undefined ? [] : [['p1', haggled]]);
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
      async quote(request: { subtotal: ReturnType<typeof money> }) {
        return {
          deliverable: true,
          reason: null,
          distanceMeters: 2_000,
          subtotal: request.subtotal,
          deliveryFee: money(0, 'UZS'),
          courierFee: money(0, 'UZS'),
          serviceFee: money(0, 'UZS'),
          discount: money(0, 'UZS'),
          total: request.subtotal,
          commission: money(0, 'UZS'),
          commissionPercent: 0,
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
      items: [{ productId: 'p1', quantity }],
    } as never),
  );
  const line = written[0]?.items[0];
  return { unit: line?.unitPrice.amount, total: line?.total.amount };
}

describe('an order of a good with quantity prices', () => {
  it('prices the whole line at the deepest step reached, and the list price below the first', async () => {
    expect(await place(4.5)).toEqual({ unit: 18_000_00, total: 81_000_00 });
    expect(await place(5)).toEqual({ unit: 17_000_00, total: 85_000_00 });
    expect(await place(12)).toEqual({ unit: 16_000_00, total: 192_000_00 });
  });

  it('keeps a haggled price where it is lower still, and the step where the step is', async () => {
    expect(await place(12, 15_500_00)).toEqual({ unit: 15_500_00, total: 186_000_00 });
    expect(await place(12, 16_500_00)).toEqual({ unit: 16_000_00, total: 192_000_00 });
  });
});

// ---------------------------------------------------------------- the public product

describe('the product the customer reads', () => {
  it('carries the steps in order, in its own currency', () => {
    const now = new Date();
    const dto = toProductDto({
      id: 'p1',
      tenantId: TENANT,
      storeId: 's1',
      categoryId: null,
      name: { ru: 'Помидоры' },
      description: null,
      slug: 'pomidory',
      unit: 'KG',
      price: 18_000_00,
      oldPrice: null,
      currency: 'UZS',
      minQuantity: new Prisma.Decimal(0.5),
      quantityStep: new Prisma.Decimal(0.5),
      weightGrams: null,
      available: true,
      stock: null,
      rating: 0,
      reviewCount: 0,
      arrivedAt: null,
      tags: [],
      createdAt: now,
      updatedAt: now,
      images: [],
      priceTiers: [
        { id: 't2', productId: 'p1', minQuantity: new Prisma.Decimal(10), price: 16_000_00 },
        { id: 't1', productId: 'p1', minQuantity: new Prisma.Decimal(5), price: 17_000_00 },
      ],
    } as never);
    expect(dto.priceTiers).toEqual([
      { minQuantity: 5, price: { amount: 17_000_00, currency: 'UZS' } },
      { minQuantity: 10, price: { amount: 16_000_00, currency: 'UZS' } },
    ]);
  });
});
