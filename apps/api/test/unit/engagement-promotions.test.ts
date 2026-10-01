/**
 * Coupons and promotions. The limits of a coupon were read before an order and never enforced in
 * the write, so two orders at the same moment both got the last redemption or the second use by one
 * customer; a code could be guessed at the speed of the endpoint, and a refusal told a guesser that
 * a personal coupon of somebody else's was real; the public list showed drafts and future
 * campaigns; and update, coupon deactivation and coupon creation took bare ids from any tenant.
 *
 * Real PromotionsService and PromotionsRepository, real roles and can(); Prisma is a fake.
 */
import { effectivePermissions, type AuthenticatedUser } from '@bazar/auth';
import { ROLE, type Role } from '@bazar/constants';
import { money } from '@bazar/payments';
import { describe, expect, it } from 'vitest';
import {
  ConflictError,
  CouponError,
  NotFoundError,
  RateLimitedError,
  ValidationError,
} from '../../src/common/errors/index.js';
import { ERROR_CODE } from '../../src/common/errors/error-codes.js';
import { runWithContext } from '../../src/common/tenant/tenant-context.js';
import { systemContext, type RequestContext } from '../../src/common/types/request-context.js';
import { PromotionsRepository } from '../../src/modules/promotions/repository/promotions.repository.js';
import { PromotionsService } from '../../src/modules/promotions/service/promotions.service.js';

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
const asOperator = as('operator', [ROLE.OPERATOR]);
const asAdmin = as('admin', [ROLE.ADMIN]);
const asAnonymous = ctx(null);
const asPlatform = systemContext(TENANT, 'job', 'ru');

const SUBTOTAL = money(100_000, 'UZS');
const HOUR = 3_600_000;

// ---------------------------------------------------------------- the service

type Coupon = {
  id: string;
  code: string;
  promotionId: string;
  customerId: string | null;
  maxRedemptions: number | null;
  maxPerCustomer: number;
  redemptionCount: number;
  expiresAt: Date | null;
  promotion: Record<string, unknown>;
};

const promotion = (over: Record<string, unknown> = {}) => ({
  id: 'promo-1',
  tenantId: TENANT,
  active: true,
  startsAt: new Date(Date.now() - HOUR),
  endsAt: null,
  discountType: 'PERCENT',
  value: 10,
  maxDiscount: null,
  minOrder: null,
  storeIds: [],
  ...over,
});

const coupon = (over: Partial<Coupon> = {}): Coupon => ({
  id: 'coupon-1',
  code: 'SPRING10',
  promotionId: 'promo-1',
  customerId: null,
  maxRedemptions: null,
  maxPerCustomer: 1,
  redemptionCount: 0,
  expiresAt: null,
  promotion: promotion(),
  ...over,
});

function world(coupons: Coupon[] = [coupon()], opts: { now?: () => number } = {}) {
  const listed: Record<string, unknown>[] = [];
  const created: Record<string, unknown>[] = [];
  const updated: { id: string; data: Record<string, unknown> }[] = [];
  const looked: string[] = [];
  const knownPromotions = new Map<string, Record<string, unknown>>([['promo-1', promotion()]]);
  const customers = new Set(['cust-1', 'cust-2']);
  const activeCoupons = new Set(coupons.map((c) => c.id));

  const repository = {
    async findCoupon(code: string) {
      looked.push(code);
      return coupons.find((c) => c.code === code) ?? null;
    },
    async countRedemptions() {
      return 0;
    },
    async listPromotions(filters: Record<string, unknown>) {
      listed.push(filters);
      return { items: [], pagination: {} };
    },
    async findPromotion(id: string) {
      return knownPromotions.get(id) ?? null;
    },
    async updatePromotion(id: string, data: Record<string, unknown>) {
      updated.push({ id, data });
      return { ...knownPromotions.get(id), ...data };
    },
    async customerExists(id: string) {
      return customers.has(id);
    },
    async createCoupon(data: Record<string, unknown>) {
      created.push(data);
      return data;
    },
    async listCoupons() {
      return [];
    },
    async deactivateCoupon(id: string) {
      return activeCoupons.delete(id);
    },
  };
  const svc = new PromotionsService({
    repository,
    ...(opts.now !== undefined ? { now: opts.now } : {}),
    logger: { error() {}, warn() {}, info() {}, debug() {} },
    events: { async publish() {} },
  } as never);
  return { svc, listed, created, updated, looked, knownPromotions };
}

const evaluate = (
  w: ReturnType<typeof world>,
  code: string,
  who = asCustomer,
  subtotal = SUBTOTAL,
) => runWithContext(who, () => w.svc.evaluate(code, 'store-1', subtotal, 'cust-1'));

describe('the public list of promotions', () => {
  it.each([
    ['anyone signed out', asAnonymous],
    ['a customer', asCustomer],
    ['a vendor', asVendor],
    ['an operator, who may not edit them', asOperator],
  ] as [string, RequestContext][])(
    'shows %s only what is running, however they ask',
    async (_, who) => {
      const w = world();
      await runWithContext(who, () => w.svc.listPromotions({}));
      await runWithContext(who, () => w.svc.listPromotions({ activeOnly: false, page: 2 }));
      expect(w.listed).toEqual([{ activeOnly: true }, { activeOnly: true, page: 2 }]);
    },
  );

  it('shows the desk that edits them everything it asks for, and the platform too', async () => {
    const w = world();
    await runWithContext(asAdmin, () => w.svc.listPromotions({}));
    await runWithContext(asAdmin, () => w.svc.listPromotions({ activeOnly: true }));
    await runWithContext(asPlatform, () => w.svc.listPromotions({ activeOnly: false }));
    expect(w.listed).toEqual([{}, { activeOnly: true }, { activeOnly: false }]);
  });
});

describe('editing promotions and coupons', () => {
  it('is the desk’s with promotion:write, and nobody else’s', async () => {
    const w = world();
    for (const who of [asCustomer, asVendor, asOperator, asAnonymous]) {
      await expect(
        runWithContext(who, () => w.svc.updatePromotion('promo-1', { active: false })),
      ).rejects.toThrow();
      await expect(
        runWithContext(who, () =>
          w.svc.createCoupon({ promotionId: 'promo-1', code: 'abcd1' } as never),
        ),
      ).rejects.toThrow();
      await expect(runWithContext(who, () => w.svc.deactivateCoupon('coupon-1'))).rejects.toThrow();
    }
    expect(w.updated).toEqual([]);
    expect(w.created).toEqual([]);
  });

  it('updates a promotion of this tenant, and says there is none for an id that is not', async () => {
    const w = world();
    await runWithContext(asAdmin, () => w.svc.updatePromotion('promo-1', { active: false }));
    expect(w.updated).toEqual([{ id: 'promo-1', data: { active: false } }]);
    await expect(
      runWithContext(asAdmin, () => w.svc.updatePromotion('promo-elsewhere', { active: false })),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(w.updated).toHaveLength(1);
  });

  it('does not let an update change whose a promotion is', async () => {
    const w = world();
    await runWithContext(asAdmin, () =>
      w.svc.updatePromotion('promo-1', { active: false, tenantId: 't2', id: 'other' } as never),
    );
    expect(w.updated[0]?.data).toEqual({ active: false });
  });

  it('keeps the rules the create schema has and the update schema lost', async () => {
    const w = world();
    // 150% off: more than the goods cost.
    await expect(
      runWithContext(asAdmin, () => w.svc.updatePromotion('promo-1', { value: 150 })),
    ).rejects.toBeInstanceOf(ValidationError);
    // Switching a fixed-amount promotion to percent keeps its stored value, which may be a sum.
    w.knownPromotions.set(
      'promo-fixed',
      promotion({ id: 'promo-fixed', discountType: 'FIXED', value: 50_000 }),
    );
    await expect(
      runWithContext(asAdmin, () =>
        w.svc.updatePromotion('promo-fixed', { discountType: 'PERCENT' }),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    // An end before the start.
    await expect(
      runWithContext(asAdmin, () =>
        w.svc.updatePromotion('promo-1', { endsAt: new Date(Date.now() - 5 * HOUR) }),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(w.updated).toEqual([]);

    await runWithContext(asAdmin, () => w.svc.updatePromotion('promo-1', { value: 100 }));
    expect(w.updated).toHaveLength(1);
  });

  it('creates a coupon under a promotion of this tenant, for a customer of this tenant', async () => {
    const w = world();
    await expect(
      runWithContext(asAdmin, () =>
        w.svc.createCoupon({ promotionId: 'promo-elsewhere', code: 'abcd1' } as never),
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      runWithContext(asAdmin, () =>
        w.svc.createCoupon({
          promotionId: 'promo-1',
          code: 'abcd1',
          customerId: 'cust-elsewhere',
        } as never),
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(w.created).toEqual([]);

    await runWithContext(asAdmin, () =>
      w.svc.createCoupon({
        promotionId: 'promo-1',
        code: 'abcd1',
        customerId: 'cust-2',
        maxPerCustomer: 1,
        redemptionCount: 99,
        active: false,
      } as never),
    );
    // Only what the form carries: a counter or a switch smuggled into the body is not stored.
    expect(w.created).toEqual([
      {
        promotionId: 'promo-1',
        tenantId: TENANT,
        code: 'ABCD1',
        maxPerCustomer: 1,
        customerId: 'cust-2',
      },
    ]);
  });

  it('deactivates a coupon of this tenant, and finds nothing for one that is not', async () => {
    const w = world();
    await runWithContext(asAdmin, () => w.svc.deactivateCoupon('coupon-1'));
    await expect(
      runWithContext(asAdmin, () => w.svc.deactivateCoupon('coupon-elsewhere')),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('applying a code', () => {
  it('gives a customer their discount for a coupon they may use', async () => {
    const w = world();
    const applied = await evaluate(w, 'spring10');
    expect(applied.discount).toEqual(money(10_000, 'UZS'));
  });

  it('never discounts more than the goods cost, whatever percentage is stored', async () => {
    const w = world([coupon({ promotion: promotion({ value: 400 }) })]);
    const applied = await evaluate(w, 'SPRING10');
    expect(applied.discount).toEqual(SUBTOTAL);
  });

  it('answers someone else’s personal coupon exactly as it answers a code that does not exist', async () => {
    const unknown = world([]);
    const personal = world([coupon({ customerId: 'cust-2' })]);
    const expired = world([
      coupon({
        customerId: 'cust-2',
        expiresAt: new Date(Date.now() - HOUR),
        maxRedemptions: 1,
        redemptionCount: 1,
      }),
    ]);
    const answers = [];
    for (const w of [unknown, personal, expired]) {
      answers.push(
        await runWithContext(asCustomer, () =>
          w.svc.preview('SPRING10', 'store-1', SUBTOTAL, 'cust-1'),
        ),
      );
    }
    expect(new Set(answers.map((a) => JSON.stringify(a))).size).toBe(1);
    expect(answers[0]).toMatchObject({ valid: false, reason: 'Coupon not found' });
  });

  it('still lets the customer a personal coupon was issued to use it', async () => {
    const w = world([coupon({ customerId: 'cust-1' })]);
    await expect(evaluate(w, 'SPRING10')).resolves.toMatchObject({ code: 'SPRING10' });
  });

  it('keeps telling a customer why their own coupon cannot be used', async () => {
    const expired = world([coupon({ expiresAt: new Date(Date.now() - HOUR) })]);
    await expect(evaluate(expired, 'SPRING10')).rejects.toMatchObject({
      code: ERROR_CODE.COUPON_EXPIRED,
    });
    const used = world([coupon({ maxRedemptions: 3, redemptionCount: 3 })]);
    await expect(evaluate(used, 'SPRING10')).rejects.toMatchObject({
      code: ERROR_CODE.COUPON_EXHAUSTED,
    });
  });

  describe('guessing', () => {
    it('is allowed ten misses in ten minutes per customer, and then asked to wait', async () => {
      let now = 1_000_000;
      const w = world([coupon()], { now: () => now });
      for (let miss = 0; miss < 10; miss += 1) {
        await expect(evaluate(w, `GUESS${miss}AA`)).rejects.toBeInstanceOf(CouponError);
      }
      // The eleventh is not even looked up, and not even a real code gets through.
      const lookups = w.looked.length;
      await expect(evaluate(w, 'SPRING10')).rejects.toBeInstanceOf(RateLimitedError);
      await expect(evaluate(w, 'GUESSAAAA')).rejects.toBeInstanceOf(RateLimitedError);
      expect(w.looked).toHaveLength(lookups);

      // Ten minutes after the first miss the window has moved on.
      now += 10 * 60_000 + 1;
      await expect(evaluate(w, 'SPRING10')).resolves.toMatchObject({ code: 'SPRING10' });
    });

    it('tells the checkout screen to wait, instead of showing a reason beside the field', async () => {
      const w = world([]);
      for (let miss = 0; miss < 10; miss += 1) {
        await runWithContext(asCustomer, () =>
          w.svc.preview(`GUESS${miss}AA`, 'store-1', SUBTOTAL, 'cust-1'),
        );
      }
      await expect(
        runWithContext(asCustomer, () => w.svc.preview('GUESSAAAA', 'store-1', SUBTOTAL, 'cust-1')),
      ).rejects.toMatchObject({ httpStatus: 429, retryAfter: expect.any(Number) });
    });

    it('is counted per customer: one person’s misses do not lock another out', async () => {
      const w = world();
      for (let miss = 0; miss < 10; miss += 1) {
        await runWithContext(asCustomer, () =>
          w.svc.evaluate(`GUESS${miss}AA`, 'store-1', SUBTOTAL, 'cust-1').catch(() => undefined),
        );
      }
      await expect(
        runWithContext(as('cust-2', [ROLE.CUSTOMER], { customerId: 'cust-2' }), () =>
          w.svc.evaluate('SPRING10', 'store-1', SUBTOTAL, 'cust-2'),
        ),
      ).resolves.toMatchObject({ code: 'SPRING10' });
    });

    it('does not count a refusal that comes from the cart, only a code that matched nothing', async () => {
      const w = world([coupon({ promotion: promotion({ minOrder: 500_000 }) })]);
      for (let tries = 0; tries < 25; tries += 1) {
        await expect(evaluate(w, 'SPRING10')).rejects.toMatchObject({
          message: 'Order is below the minimum for this coupon',
        });
      }
    });
  });
});

// ---------------------------------------------------------------- the writes

describe('redeeming a coupon', () => {
  type TxState = {
    coupon: {
      maxRedemptions: number | null;
      maxPerCustomer: number;
      redemptionCount: number;
      active: boolean;
    };
    redemptions: { couponId: string; customerId: string; orderId: string; discount: number }[];
    claims: Record<string, unknown>[];
  };

  /** The transaction the order opens: the conditional bump is evaluated against the row, as SQL would. */
  function tx(state: TxState) {
    const fields = { maxRedemptions: Symbol('maxRedemptions') };
    return {
      coupon: {
        fields,
        async updateMany({ where }: { where: Record<string, unknown> }) {
          state.claims.push(where);
          const row = state.coupon;
          const limited = (where['OR'] as Record<string, unknown>[]).some(
            (branch) => 'redemptionCount' in branch,
          );
          const open =
            row.active &&
            (!limited || row.maxRedemptions === null || row.redemptionCount < row.maxRedemptions);
          if (open) row.redemptionCount += 1;
          return { count: open ? 1 : 0 };
        },
        async findUnique() {
          return { maxPerCustomer: state.coupon.maxPerCustomer };
        },
      },
      couponRedemption: {
        async count({ where }: { where: { couponId: string; customerId: string } }) {
          return state.redemptions.filter(
            (r) => r.couponId === where.couponId && r.customerId === where.customerId,
          ).length;
        },
        async create({ data }: { data: TxState['redemptions'][number] }) {
          state.redemptions.push(data);
          return data;
        },
      },
    };
  }

  const state = (over: Partial<TxState['coupon']> = {}): TxState => ({
    coupon: { maxRedemptions: null, maxPerCustomer: 1, redemptionCount: 0, active: true, ...over },
    redemptions: [],
    claims: [],
  });
  const repository = new PromotionsRepository({} as never);
  const redeem = (s: TxState, customerId: string, orderId: string) =>
    runWithContext(asPlatform, () =>
      repository.redeem('coupon-1', customerId, orderId, 10_000, tx(s) as never),
    );

  it('records the use and bumps the counter', async () => {
    const s = state({ maxRedemptions: 2 });
    await redeem(s, 'cust-1', 'o1');
    expect(s.redemptions).toEqual([
      { couponId: 'coupon-1', customerId: 'cust-1', orderId: 'o1', discount: 10_000 },
    ]);
    expect(s.coupon.redemptionCount).toBe(1);
  });

  it('gives the last redemption to one order, however many were checked against it', async () => {
    const s = state({ maxRedemptions: 1 });
    await redeem(s, 'cust-1', 'o1');
    await expect(redeem(s, 'cust-2', 'o2')).rejects.toMatchObject({
      code: ERROR_CODE.COUPON_EXHAUSTED,
    });
    expect(s.redemptions).toHaveLength(1);
    expect(s.coupon.redemptionCount).toBe(1);
  });

  it('keeps one customer to the uses a coupon allows them', async () => {
    const s = state({ maxPerCustomer: 1 });
    await redeem(s, 'cust-1', 'o1');
    await expect(redeem(s, 'cust-1', 'o2')).rejects.toMatchObject({
      code: ERROR_CODE.COUPON_EXHAUSTED,
    });
    await redeem(s, 'cust-2', 'o3');
    expect(s.redemptions.map((r) => r.orderId)).toEqual(['o1', 'o3']);
  });

  it('refuses a coupon that was switched off in between', async () => {
    const s = state({ active: false });
    await expect(redeem(s, 'cust-1', 'o1')).rejects.toBeInstanceOf(CouponError);
    expect(s.redemptions).toEqual([]);
  });

  it('takes the counter in a statement bound to the tenant, the coupon and its limit', async () => {
    const s = state({ maxRedemptions: 5 });
    await redeem(s, 'cust-1', 'o1');
    expect(s.claims[0]).toMatchObject({
      id: 'coupon-1',
      tenantId: TENANT,
      active: true,
      OR: [{ maxRedemptions: null }, { redemptionCount: { lt: expect.anything() } }],
    });
  });
});

describe('the promotions tables', () => {
  function recording() {
    const calls: { op: string; args: Record<string, unknown> }[] = [];
    const record = (op: string, result: unknown) => async (args: Record<string, unknown>) => {
      calls.push({ op, args });
      return result;
    };
    const prisma = {
      promotion: {
        findFirst: record('promotion.findFirst', null),
        update: record('promotion.update', {}),
      },
      coupon: {
        updateMany: record('coupon.updateMany', { count: 0 }),
        create: async (args: Record<string, unknown>) => {
          calls.push({ op: 'coupon.create', args });
          throw Object.assign(new Error('unique'), { code: 'P2002' });
        },
      },
      customer: { count: record('customer.count', 0) },
    };
    return { repository: new PromotionsRepository(prisma as never), calls };
  }

  it('finds, updates and deactivates only inside the tenant', async () => {
    const { repository, calls } = recording();
    await runWithContext(asAdmin, async () => {
      await repository.findPromotion('p1');
      await repository.updatePromotion('p1', { active: false });
      await expect(repository.deactivateCoupon('c1')).resolves.toBe(false);
      await repository.customerExists('cust-9');
    });
    expect(calls.map((c) => [c.op, c.args['where']])).toEqual([
      ['promotion.findFirst', { id: 'p1', tenantId: TENANT }],
      ['promotion.update', { id: 'p1', tenantId: TENANT }],
      ['coupon.updateMany', { id: 'c1', tenantId: TENANT }],
      ['customer.count', { id: 'cust-9', tenantId: TENANT }],
    ]);
  });

  it('answers a code that is taken with a conflict', async () => {
    const { repository } = recording();
    await expect(
      runWithContext(asAdmin, () => repository.createCoupon({ code: 'X' } as never)),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});
