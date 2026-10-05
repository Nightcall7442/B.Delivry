/**
 * A cart is the customer's own, one per store of this tenant. Opening one for a store id the
 * tenant does not have (another tenant's stall, or an id that is nobody's) created the row all the
 * same, because the (customer, store) key accepts anything; and "add" is cumulative, so the ceiling
 * the schema puts on one request did not hold for the line.
 *
 * Real CartService and CartRepository; the catalog and Prisma are fakes.
 */
import { effectivePermissions, type AuthenticatedUser } from '@bazar/auth';
import { LIMITS, ROLE, type Role } from '@bazar/constants';
import { describe, expect, it } from 'vitest';
import { ConflictError, ForbiddenError, NotFoundError } from '../../src/common/errors/index.js';
import { runWithContext } from '../../src/common/tenant/tenant-context.js';
import type { RequestContext } from '../../src/common/types/request-context.js';
import { CartRepository } from '../../src/modules/cart/repository/cart.repository.js';
import { CartService } from '../../src/modules/cart/service/cart.service.js';

const TENANT = 't1';

const ctx = (user: AuthenticatedUser | null): RequestContext => ({
  requestId: 'r1',
  tenantId: TENANT,
  locale: 'ru',
  user,
  ip: null,
  userAgent: null,
  startedAt: new Date(),
});

const as = (name: string, roles: Role[], ids: { customerId?: string; vendorId?: string } = {}) =>
  ctx({
    id: `user-${name}`,
    tenantId: TENANT,
    roles,
    permissions: effectivePermissions(roles),
    sessionId: 's1',
    locale: 'ru',
    ...ids,
  });

const asCustomer = as('cust-1', [ROLE.CUSTOMER], { customerId: 'cust-1' });
const asVendor = as('vendor-1', [ROLE.VENDOR], { vendorId: 'vendor-1' });

type Item = {
  id: string;
  cartId: string;
  productId: string;
  quantity: number;
  comment: string | null;
  currency: string;
  unitPrice: number;
};

function world() {
  const stores = new Set(['store-1']);
  const ensured: string[] = [];
  const carts = new Map<
    string,
    { id: string; storeId: string; customerId: string; items: Item[]; expiresAt: Date }
  >();
  let seq = 0;

  const repository = {
    async storeExists(id: string) {
      return stores.has(id);
    },
    async ensure(customerId: string, storeId: string) {
      ensured.push(`${customerId}:${storeId}`);
      const key = `${customerId}:${storeId}`;
      if (!carts.has(key)) {
        carts.set(key, {
          id: `cart-${++seq}`,
          storeId,
          customerId,
          items: [],
          expiresAt: new Date(),
        });
      }
      return carts.get(key)!;
    },
    async find(customerId: string, storeId: string) {
      return carts.get(`${customerId}:${storeId}`) ?? null;
    },
    async listForCustomer(customerId: string) {
      return [...carts.values()].filter((cart) => cart.customerId === customerId);
    },
    async findItemByProduct(cartId: string, productId: string) {
      for (const cart of carts.values()) {
        const item = cart.items.find((i) => i.cartId === cartId && i.productId === productId);
        if (item !== undefined) return item;
      }
      return null;
    },
    async countItems(cartId: string) {
      return [...carts.values()].find((c) => c.id === cartId)?.items.length ?? 0;
    },
    async upsertItem(
      cartId: string,
      productId: string,
      quantity: number,
      unitPrice: number,
      currency: string,
      comment: string | null,
    ) {
      const cart = [...carts.values()].find((c) => c.id === cartId)!;
      const existing = cart.items.find((i) => i.productId === productId);
      if (existing !== undefined) existing.quantity += quantity;
      else
        cart.items.push({
          id: `item-${++seq}`,
          cartId,
          productId,
          quantity,
          comment,
          currency,
          unitPrice,
        });
    },
    async findItem(cartId: string, itemId: string) {
      for (const cart of carts.values()) {
        const item = cart.items.find((i) => i.cartId === cartId && i.id === itemId);
        if (item !== undefined) return item;
      }
      return null;
    },
    async setItemQuantity(itemId: string, quantity: number) {
      for (const cart of carts.values()) {
        const item = cart.items.find((i) => i.id === itemId);
        if (item !== undefined) item.quantity = quantity;
      }
    },
    async removeItem() {},
    async clear() {},
  };
  const catalog = {
    async getPurchasable(storeId: string, ids: string[]) {
      return new Map(
        ids
          .filter((id) => storeId === 'store-1' && id.startsWith('prod-'))
          .map((id) => [
            id,
            {
              id,
              storeId,
              name: {},
              unit: 'KG',
              price: 5_000,
              currency: 'UZS',
              minQuantity: 1,
              quantityStep: 1,
              priceTiers: [],
            },
          ]),
      );
    },
  };
  const svc = new CartService({
    repository,
    catalog,
    logger: { error() {}, warn() {}, info() {}, debug() {} },
    events: { async publish() {} },
  } as never);
  return { svc, ensured, carts };
}

describe('opening a cart', () => {
  it('is for a store of this tenant', async () => {
    const w = world();
    await expect(runWithContext(asCustomer, () => w.svc.get('store-1'))).resolves.toMatchObject({
      storeId: 'store-1',
      items: [],
    });
    expect(w.ensured).toEqual(['cust-1:store-1']);
  });

  it('is refused for a store id the tenant does not have, and no cart row is made', async () => {
    const w = world();
    const opens: (() => Promise<unknown>)[] = [
      () => w.svc.get('store-elsewhere'),
      () => w.svc.updateItem('store-elsewhere', 'item-1', 2),
      () => w.svc.removeItem('store-elsewhere', 'item-1'),
    ];
    for (const open of opens) {
      await expect(runWithContext(asCustomer, open)).rejects.toBeInstanceOf(NotFoundError);
    }
    expect(w.ensured).toEqual([]);
    expect(w.carts.size).toBe(0);
  });

  it('is the signed-in customer’s own, and nobody else can ask for one', async () => {
    const w = world();
    await expect(runWithContext(asVendor, () => w.svc.get('store-1'))).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(runWithContext(asVendor, () => w.svc.list())).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(
      runWithContext(asVendor, () =>
        w.svc.addItem({ storeId: 'store-1', productId: 'prod-1', quantity: 1 }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(w.ensured).toEqual([]);
  });

  it('keeps one customer out of another’s lines: an item is found in the caller’s own cart only', async () => {
    const w = world();
    await runWithContext(asCustomer, () =>
      w.svc.addItem({ storeId: 'store-1', productId: 'prod-1', quantity: 1 }),
    );
    const item = [...w.carts.values()][0]!.items[0]!;
    const other = as('cust-2', [ROLE.CUSTOMER], { customerId: 'cust-2' });
    await expect(
      runWithContext(other, () => w.svc.updateItem('store-1', item.id, 5)),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      runWithContext(other, () => w.svc.removeItem('store-1', item.id)),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(item.quantity).toBe(1);
  });
});

describe('adding to a cart', () => {
  const add = (w: ReturnType<typeof world>, quantity: number, productId = 'prod-1') =>
    runWithContext(asCustomer, () => w.svc.addItem({ storeId: 'store-1', productId, quantity }));

  it('adds up, as a customer tapping + expects', async () => {
    const w = world();
    await add(w, 2);
    const view = await add(w, 3);
    expect(view.items).toHaveLength(1);
    expect(view.items[0]?.quantity).toBe(5);
  });

  it('stops the line at the ceiling of one request, however many requests build it', async () => {
    const w = world();
    const half = Math.floor(LIMITS.CART_MAX_QTY_PER_ITEM / 2);
    await add(w, half);
    await add(w, half);
    await expect(add(w, half)).rejects.toBeInstanceOf(ConflictError);
    const line = [...w.carts.values()][0]!.items[0]!;
    expect(line.quantity).toBe(half * 2);

    // The ceiling is per line: another product starts from zero.
    await expect(add(w, half, 'prod-2')).resolves.toBeDefined();
  });

  it('refuses a product the store does not sell', async () => {
    const w = world();
    await expect(add(w, 1, 'elsewhere-9')).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('the cart tables', () => {
  it('asks whether a store exists inside the tenant, not deleted and visible to the viewer', async () => {
    const calls: Record<string, unknown>[] = [];
    const repository = new CartRepository({
      store: {
        async count(args: Record<string, unknown>) {
          calls.push(args);
          return 1;
        },
      },
    } as never);
    await expect(runWithContext(asCustomer, () => repository.storeExists('store-1'))).resolves.toBe(
      true,
    );
    // The tenant and not deleted, and — for a customer — one of the stalls the public may see.
    expect(calls[0]?.['where']).toEqual({
      AND: [
        { id: 'store-1', tenantId: TENANT, deletedAt: null },
        {
          deletedAt: null,
          status: { in: ['ACTIVE', 'CLOSED'] },
          vendor: { status: { notIn: ['SUSPENDED', 'REJECTED'] } },
        },
      ],
    });
  });
});
