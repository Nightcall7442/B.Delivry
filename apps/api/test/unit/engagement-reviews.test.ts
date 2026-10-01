/**
 * Who may say what about an order, a stall or a courier. Only the customer of a delivered order
 * reviews it, once per thing; the reviewed courier or the stall's own vendor answers, once; the
 * desk moderates. The gaps that were left: two taps on "send" both passed the exists() check and
 * the second hit the unique key as a 500, two replies could race and the later one overwrote the
 * first, and the writes by bare id did not carry the tenant.
 *
 * Real ReviewsService and ReviewsRepository, real roles and can(); the orders, stores and couriers
 * services and Prisma are fakes.
 */
import { effectivePermissions, type AuthenticatedUser } from '@bazar/auth';
import { ROLE, type Role } from '@bazar/constants';
import { describe, expect, it } from 'vitest';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from '../../src/common/errors/index.js';
import { runWithContext } from '../../src/common/tenant/tenant-context.js';
import type { RequestContext } from '../../src/common/types/request-context.js';
import { ReviewsRepository } from '../../src/modules/reviews/repository/reviews.repository.js';
import { ReviewsService } from '../../src/modules/reviews/service/reviews.service.js';

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

const as = (
  name: string,
  roles: Role[],
  ids: { customerId?: string; vendorId?: string; courierId?: string } = {},
) =>
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
const asOtherCustomer = as('cust-2', [ROLE.CUSTOMER], { customerId: 'cust-2' });
const asCustomerNoProfile = as('cust-none', [ROLE.CUSTOMER]);
const asStallVendor = as('vendor-1', [ROLE.VENDOR], { vendorId: 'vendor-1' });
const asOtherVendor = as('vendor-2', [ROLE.VENDOR], { vendorId: 'vendor-2' });
const asVendorNoProfile = as('vendor-none', [ROLE.VENDOR]);
const asCourier = as('courier-1', [ROLE.COURIER], { courierId: 'courier-1' });
const asOtherCourier = as('courier-2', [ROLE.COURIER], { courierId: 'courier-2' });
const asOperator = as('operator', [ROLE.OPERATOR]);
const asAnonymous = ctx(null);

type Review = {
  id: string;
  tenantId: string;
  orderId: string;
  customerId: string;
  target: 'STORE' | 'PRODUCT' | 'COURIER';
  targetId: string;
  rating: number;
  reply: string | null;
  published: boolean;
};

function world(orderStatus = 'DELIVERED') {
  const reviews: Review[] = [];
  const refreshed: string[] = [];
  const order = {
    id: 'o1',
    customerId: 'cust-1',
    storeId: 'store-1',
    courierId: 'courier-1',
    status: orderStatus,
    items: [{ productId: 'prod-1' }],
  };

  const repository = {
    async exists(orderId: string, target: string, targetId: string) {
      return reviews.some(
        (r) => r.orderId === orderId && r.target === target && r.targetId === targetId,
      );
    },
    async create(input: Record<string, unknown>, customerId: string) {
      const made = {
        id: `rev-${reviews.length + 1}`,
        tenantId: TENANT,
        customerId,
        reply: null,
        published: true,
        ...input,
      } as Review;
      reviews.push(made);
      return made;
    },
    // A snapshot, as a database read is: later writes do not change what was already read.
    async findById(id: string) {
      const found = reviews.find((r) => r.id === id);
      return found === undefined ? null : { ...found };
    },
    // The first answer stands: null when there already is one, in one step.
    async reply(id: string, text: string) {
      const found = reviews.find((r) => r.id === id);
      if (found === undefined || found.reply !== null) return null;
      found.reply = text;
      return found;
    },
    async setPublished(id: string, published: boolean) {
      const found = reviews.find((r) => r.id === id)!;
      found.published = published;
      return found;
    },
    async list(filters: Record<string, unknown>) {
      return { items: [], pagination: { filters } };
    },
    async summary() {
      return { average: 0, count: 0, distribution: {} };
    },
  };

  const orders = {
    async get(id: string) {
      if (id !== order.id) throw new NotFoundError('Order', id);
      return order;
    },
  };
  const stores = {
    async get(id: string) {
      if (id === 'store-1') return { id, vendorId: 'vendor-1' };
      if (id === 'store-2') return { id, vendorId: 'vendor-2' };
      throw new NotFoundError('Store', id);
    },
    async refreshRating(id: string) {
      refreshed.push(`store:${id}`);
    },
  };
  const couriers = {
    async refreshRating(id: string) {
      refreshed.push(`courier:${id}`);
    },
  };

  const svc = new ReviewsService({
    repository,
    orders,
    stores,
    couriers,
    logger: { error() {}, warn() {}, info() {}, debug() {} },
    events: { async publish() {} },
  } as never);
  return { svc, reviews, refreshed, order };
}

const STORE = { orderId: 'o1', target: 'STORE', targetId: 'store-1', rating: 5 } as const;
const COURIER = { orderId: 'o1', target: 'COURIER', targetId: 'courier-1', rating: 4 } as const;

describe('reviewing an order', () => {
  it('is the customer’s, once the order is delivered, for each thing once', async () => {
    const w = world();
    await runWithContext(asCustomer, () => w.svc.create(STORE));
    await runWithContext(asCustomer, () => w.svc.create(COURIER));
    await runWithContext(asCustomer, () =>
      w.svc.create({ orderId: 'o1', target: 'PRODUCT', targetId: 'prod-1', rating: 5 }),
    );
    expect(w.reviews.map((r) => r.target)).toEqual(['STORE', 'COURIER', 'PRODUCT']);
    expect(w.refreshed).toEqual(['store:store-1', 'courier:courier-1']);

    await expect(runWithContext(asCustomer, () => w.svc.create(STORE))).rejects.toBeInstanceOf(
      ConflictError,
    );
    expect(w.reviews).toHaveLength(3);
  });

  it.each([
    ['another customer', asOtherCustomer],
    ['the stall’s vendor', asStallVendor],
    ['the order’s courier', asCourier],
    ['a customer token without a profile', asCustomerNoProfile],
  ] as [string, RequestContext][])('is not left by %s', async (_, who) => {
    const w = world();
    await expect(runWithContext(who, () => w.svc.create(STORE))).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    expect(w.reviews).toEqual([]);
  });

  it('waits for the delivery, and must name something that was part of the order', async () => {
    for (const status of ['PENDING', 'IN_DELIVERY', 'CANCELLED']) {
      const w = world(status);
      await expect(runWithContext(asCustomer, () => w.svc.create(STORE))).rejects.toBeInstanceOf(
        ConflictError,
      );
    }
    const w = world();
    for (const stranger of [
      { ...STORE, targetId: 'store-2' },
      { ...COURIER, targetId: 'courier-2' },
      { orderId: 'o1', target: 'PRODUCT', targetId: 'prod-9', rating: 3 } as const,
    ]) {
      await expect(runWithContext(asCustomer, () => w.svc.create(stranger))).rejects.toBeInstanceOf(
        ConflictError,
      );
    }
    expect(w.reviews).toEqual([]);
  });

  it('needs a signed-in caller', async () => {
    const w = world();
    await expect(runWithContext(asAnonymous, () => w.svc.create(STORE))).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });
});

describe('answering a review', () => {
  const seed = async (w: ReturnType<typeof world>) => {
    const store = await runWithContext(asCustomer, () => w.svc.create(STORE));
    const courier = await runWithContext(asCustomer, () => w.svc.create(COURIER));
    return { store, courier };
  };

  it('is the stall’s own vendor’s for a review of the stall, the courier’s for a review of them', async () => {
    const w = world();
    const { store, courier } = await seed(w);
    await runWithContext(asStallVendor, () => w.svc.reply(store.id, 'Thank you'));
    await runWithContext(asCourier, () => w.svc.reply(courier.id, 'Thanks!'));
    expect(w.reviews.map((r) => r.reply)).toEqual(['Thank you', 'Thanks!']);
  });

  it.each([
    ['another stall’s vendor', asOtherVendor],
    ['a vendor token without a vendor profile', asVendorNoProfile],
    ['another courier', asOtherCourier],
    ['a customer', asOtherCustomer],
    ['the customer who wrote it', asCustomer],
  ] as [string, RequestContext][])('is not %s’s to do', async (_, who) => {
    const w = world();
    const { store, courier } = await seed(w);
    for (const review of [store, courier]) {
      await expect(runWithContext(who, () => w.svc.reply(review.id, 'hm'))).rejects.toBeInstanceOf(
        ForbiddenError,
      );
    }
    expect(w.reviews.map((r) => r.reply)).toEqual([null, null]);
  });

  it('is something the desk may do for anyone', async () => {
    const w = world();
    const { store } = await seed(w);
    await runWithContext(asOperator, () => w.svc.reply(store.id, 'We are sorry'));
    expect(w.reviews[0]?.reply).toBe('We are sorry');
  });

  it('is given once: a second answer, even a racing one, does not overwrite the first', async () => {
    const w = world();
    const { store } = await seed(w);
    const results = await Promise.allSettled([
      runWithContext(asStallVendor, () => w.svc.reply(store.id, 'first')),
      runWithContext(asOperator, () => w.svc.reply(store.id, 'second')),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
    const winner = results.find((r) => r.status === 'fulfilled') as PromiseFulfilledResult<Review>;
    expect(w.reviews[0]?.reply).toBe(winner.value.reply);
    await expect(
      runWithContext(asStallVendor, () => w.svc.reply(store.id, 'third')),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe('moderating and reading reviews', () => {
  it('lets only the desk hide a review, and moves the rating when it does', async () => {
    const w = world();
    const review = await runWithContext(asCustomer, () => w.svc.create(STORE));
    for (const who of [asStallVendor, asCustomer, asCourier]) {
      await expect(
        runWithContext(who, () => w.svc.setPublished(review.id, false)),
      ).rejects.toBeInstanceOf(ForbiddenError);
    }
    w.refreshed.length = 0;
    await runWithContext(asOperator, () => w.svc.setPublished(review.id, false));
    expect(w.reviews[0]?.published).toBe(false);
    expect(w.refreshed).toEqual(['store:store-1']);
  });

  it('shows anyone the published ones, and the hidden ones to the desk alone', async () => {
    const w = world();
    await expect(
      runWithContext(asAnonymous, () => w.svc.list({ target: 'STORE', targetId: 'store-1' })),
    ).resolves.toBeDefined();
    for (const who of [asAnonymous, asStallVendor, asCustomer]) {
      await expect(runWithContext(who, () => w.svc.list({ published: false }))).rejects.toThrow();
    }
    await expect(
      runWithContext(asOperator, () => w.svc.list({ published: false })),
    ).resolves.toBeDefined();
  });
});

describe('the reviews table', () => {
  function recording(opts: { duplicate?: boolean; replied?: boolean } = {}) {
    const calls: { op: string; args: Record<string, unknown> }[] = [];
    const prisma = {
      review: {
        async create(args: Record<string, unknown>) {
          calls.push({ op: 'create', args });
          if (opts.duplicate === true) throw Object.assign(new Error('unique'), { code: 'P2002' });
          return { id: 'r1' };
        },
        async count(args: Record<string, unknown>) {
          calls.push({ op: 'count', args });
          return 0;
        },
        async updateMany(args: Record<string, unknown>) {
          calls.push({ op: 'updateMany', args });
          return { count: opts.replied === true ? 0 : 1 };
        },
        async findFirst(args: Record<string, unknown>) {
          calls.push({ op: 'findFirst', args });
          return { id: 'r1' };
        },
        async update(args: Record<string, unknown>) {
          calls.push({ op: 'update', args });
          return { id: 'r1' };
        },
      },
    };
    return { repository: new ReviewsRepository(prisma as never), calls };
  }
  const input = { orderId: 'o1', target: 'STORE', targetId: 's1', rating: 5 } as const;

  it('turns the unique key’s refusal of a double tap into a conflict, not a server error', async () => {
    const { repository } = recording({ duplicate: true });
    await expect(
      runWithContext(asCustomer, () => repository.create(input, 'cust-1')),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('looks for an earlier review inside the tenant', async () => {
    const { repository, calls } = recording();
    await runWithContext(asCustomer, () => repository.exists('o1', 'STORE', 's1'));
    expect(calls[0]?.args['where']).toEqual({
      orderId: 'o1',
      target: 'STORE',
      targetId: 's1',
      tenantId: TENANT,
    });
  });

  it('writes a reply only where there is none yet, inside the tenant', async () => {
    const { repository, calls } = recording();
    await runWithContext(asStallVendor, () => repository.reply('r1', 'thanks'));
    expect(calls[0]?.args['where']).toEqual({ id: 'r1', reply: null, tenantId: TENANT });

    const taken = recording({ replied: true });
    await expect(
      runWithContext(asStallVendor, () => taken.repository.reply('r1', 'thanks')),
    ).resolves.toBeNull();
  });

  it('hides a review only inside the tenant', async () => {
    const { repository, calls } = recording();
    await runWithContext(asOperator, () => repository.setPublished('r1', false));
    expect(calls[0]?.args['where']).toEqual({ id: 'r1', tenantId: TENANT });
  });
});
