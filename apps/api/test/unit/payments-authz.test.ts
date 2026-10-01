/**
 * POST /payments resolved what to charge from whatever the caller named and never asked who was
 * paying: the stall's vendor, the order's courier or any signed-in user could open a payment for
 * someone else's order, Plus month or tip, and with BALANCE take it out of that customer's wallet.
 * GET /payments narrowed to "own" only when the token happened to carry a customerId, so a vendor
 * token without a customer profile read every payment of the tenant. Whose payment it is now
 * decides who may pay and who may read; provider callbacks (no user) and the desk keep settling
 * for other people.
 *
 * Real roles and the real can(); the repository, Prisma and the provider are fakes.
 */
import { can, effectivePermissions, type AuthenticatedUser } from '@bazar/auth';
import { PAYMENT_METHOD, PERMISSION, PLUS, PROMOTION, ROLE, type Role } from '@bazar/constants';
import { money } from '@bazar/payments';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  AppError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  PaymentFailedError,
} from '../../src/common/errors/index.js';
import { requireContext, runWithContext } from '../../src/common/tenant/tenant-context.js';
import { systemContext, type RequestContext } from '../../src/common/types/request-context.js';
import { PaymentsController } from '../../src/modules/payments/controller/payments.controller.js';
import { ClickShopApi } from '../../src/modules/payments/service/click-shop.js';
import {
  PAYME_ERROR,
  PaymeMerchantApi,
} from '../../src/modules/payments/service/payme-merchant.js';
import { PaymentsService } from '../../src/modules/payments/service/payments.service.js';

const TENANT = 't1';
const DAY = '2026-10-01';
const TOTAL = 5_000_000;
const TIP = 200_000;
const WALLET = 10_000_000;
const { ONLINE, BALANCE, CASH, INVOICE } = PAYMENT_METHOD;

// ---------------------------------------------------------------- people

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
const asCustomerNoId = as('cust-none', [ROLE.CUSTOMER]);
const asStallVendor = as('vendor-stall', [ROLE.VENDOR], { vendorId: 'vendor-stall' });
const asOtherVendor = as('vendor-other', [ROLE.VENDOR], { vendorId: 'vendor-other' });
const asVendorNoId = as('vendor-none', [ROLE.VENDOR]);
const asCourier = as('courier-1', [ROLE.COURIER], { courierId: 'courier-1' });
const asAdmin = as('admin', [ROLE.ADMIN]);
const asOperator = as('operator', [ROLE.OPERATOR]);
/** A job, or a provider callback after the controller's asSystem(): no user, every permission. */
const asPlatform = systemContext(TENANT, 'job', 'ru');
/** What a public webhook request carries until the controller switches it to the platform. */
const asWebhook = ctx(null);

type Who = readonly [string, RequestContext];
const DESK: Who[] = [
  ['an admin', asAdmin],
  ['an operator', asOperator],
];

// ---------------------------------------------------------------- the world

type Row = {
  id: string;
  tenantId: string;
  orderId: string | null;
  purpose: string;
  subject: string;
  customerId: string;
  method: string;
  provider: string;
  status: string;
  amount: number;
  refundedAmount: number;
  currency: string;
  externalId: string | null;
  confirmationUrl: string | null;
  paidAt: Date | null;
  failureReason: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function world(opts: { status?: string; vendorProfile?: boolean } = {}) {
  const order = {
    id: 'o1',
    number: 'BZ-1',
    tenantId: TENANT,
    customerId: 'cust-1',
    courierId: 'courier-1',
    store: { vendorId: 'vendor-stall' },
    status: opts.status ?? 'CONFIRMED',
    paymentStatus: 'PENDING',
    currency: 'UZS',
    total: TOTAL,
  };

  const stores = new Map([
    [
      'store-1',
      { tenantId: TENANT, vendorId: 'vendor-stall', vendor: { userId: 'user-vendor-stall' } },
    ],
    [
      'store-2',
      { tenantId: TENANT, vendorId: 'vendor-other', vendor: { userId: 'user-vendor-other' } },
    ],
    [
      'store-foreign',
      { tenantId: 't2', vendorId: 'vendor-foreign', vendor: { userId: 'user-foreign' } },
    ],
  ]);
  // user id -> customer profile id
  const profiles = new Map([
    ['user-cust-1', 'cust-1'],
    ['user-cust-2', 'cust-2'],
  ]);
  if (opts.vendorProfile === true) profiles.set('user-vendor-stall', 'cust-vendor-stall');
  const madeProfiles: string[] = [];

  const payments: Row[] = [];
  const ledger: { userId: string; type: string; amount: number }[] = [];
  const published: string[] = [];
  const charges: unknown[] = [];
  const listed: Record<string, unknown>[] = [];
  const transactions: { paymentId: string; type: string; raw: unknown; idempotencyKey: string }[] =
    [];
  let seq = 0;

  const balanceOf = (userId: string) =>
    ledger.filter((entry) => entry.userId === userId).reduce((sum, entry) => sum + entry.amount, 0);
  const fund = (userId: string, amount: number) => ledger.push({ userId, type: 'TOPUP', amount });
  /** Everything that left a wallet. */
  const debits = () => ledger.filter((entry) => entry.amount < 0);

  const prisma = {
    store: {
      // The old lookup: by id alone, in every tenant.
      async findUnique({ where }: { where: { id: string } }) {
        return stores.get(where.id) ?? null;
      },
      async findFirst({ where }: { where: { id: string; tenantId?: string } }) {
        const store = stores.get(where.id);
        if (store === undefined) return null;
        return where.tenantId === undefined || where.tenantId === store.tenantId ? store : null;
      },
    },
    customer: {
      async findUnique({ where }: { where: { userId: string } }) {
        const id = profiles.get(where.userId);
        return id === undefined ? null : { id };
      },
      async upsert({ where }: { where: { userId: string } }) {
        let id = profiles.get(where.userId);
        if (id === undefined) {
          id = `cust-${where.userId}`;
          profiles.set(where.userId, id);
          madeProfiles.push(where.userId);
        }
        return { id };
      },
    },
    async $transaction<T>(fn: (tx: unknown) => Promise<T>) {
      return fn({});
    },
  };

  const repository = {
    async create(data: Record<string, unknown>) {
      const row = {
        id: `pay-${++seq}`,
        tenantId: TENANT,
        status: 'PENDING',
        refundedAmount: 0,
        externalId: null,
        confirmationUrl: null,
        paidAt: null,
        failureReason: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data,
      } as Row;
      payments.push(row);
      return row;
    },
    async findById(id: string) {
      return payments.find((p) => p.id === id) ?? null;
    },
    async findByExternalId(externalId: string) {
      return payments.find((p) => p.externalId === externalId) ?? null;
    },
    async findBySubject(subject: string) {
      return payments.filter((p) => p.subject === subject);
    },
    async list(filters: Record<string, unknown>) {
      listed.push(filters);
      return {
        items: payments,
        pagination: { page: 1, pageSize: 1000, total: payments.length, totalPages: 1 },
      };
    },
    async updateStatus(id: string, status: string, extra: Record<string, unknown> = {}) {
      const row = payments.find((p) => p.id === id)!;
      Object.assign(row, extra, { status, updatedAt: new Date() });
      return row;
    },
    async recordTransaction(data: {
      paymentId: string;
      type: string;
      raw?: unknown;
      idempotencyKey: string;
    }) {
      if (transactions.some((t) => t.idempotencyKey === data.idempotencyKey)) return false;
      transactions.push({ ...data, raw: data.raw ?? null });
      return true;
    },
    async transactionsOf(paymentId: string) {
      return transactions.filter((t) => t.paymentId === paymentId);
    },
    async customerUserId(customerId: string) {
      for (const [userId, id] of profiles) if (id === customerId) return userId;
      return null;
    },
    async walletBalance(userId: string) {
      return balanceOf(userId);
    },
    async appendWalletEntry(entry: { userId: string; type: string; amount: { amount: number } }) {
      ledger.push({ userId: entry.userId, type: entry.type, amount: entry.amount.amount });
      return {};
    },
  };

  // OrdersService.get authorizes `order:read` with the order's parties — its customer, the stall's
  // vendor, its courier — and staff through `order:read_any`; a callback or job sees every order.
  const orders = {
    async get(id: string) {
      if (id !== order.id) throw new NotFoundError('Order', id);
      const context = requireContext();
      if (context.system !== true) {
        const allowed =
          context.user !== null &&
          can(context.user, PERMISSION.ORDER_READ, {
            tenantId: order.tenantId,
            customerId: order.customerId,
            vendorId: order.store.vendorId,
            courierId: order.courierId,
          });
        if (!allowed) throw new ForbiddenError(`Missing permission: ${PERMISSION.ORDER_READ}`);
      }
      return order;
    },
    totalsOf: () => ({ total: money(order.total, 'UZS') }),
  };

  const provider = {
    id: 'payme',
    async createPayment(request: unknown) {
      charges.push(request);
      return {
        status: 'PENDING',
        externalId: `ext-${charges.length}`,
        confirmationUrl: 'https://pay.test/checkout',
        raw: {},
      };
    },
    async capture() {
      return { status: 'CAPTURED', externalId: 'ext-1', raw: {} };
    },
  };

  const logger = { error() {}, warn() {}, info() {}, debug() {} };
  const svc = new PaymentsService({
    logger,
    events: {
      async publish(event: { name: string }) {
        published.push(event.name);
      },
    },
    prisma,
    repository,
    orders,
    providers: new Map([
      ['payme', provider],
      ['click', { ...provider, id: 'click' }],
    ]),
    defaultProvider: 'payme',
  } as never);

  return {
    svc,
    repository,
    logger,
    order,
    payments,
    ledger,
    published,
    charges,
    listed,
    madeProfiles,
    balanceOf,
    fund,
    debits,
  };
}

type World = ReturnType<typeof world>;

/** Nothing was opened, charged or debited — for anybody. */
function expectUntouched(w: World, funded: Record<string, number> = {}) {
  expect(w.payments).toEqual([]);
  expect(w.charges).toEqual([]);
  expect(w.debits()).toEqual([]);
  for (const [userId, amount] of Object.entries(funded)) {
    expect(w.balanceOf(userId)).toBe(amount);
  }
}

// ---------------------------------------------------------------- an order

describe('paying for an order', () => {
  it('is the customer’s own: online, and from their balance', async () => {
    const online = world();
    const opened = await runWithContext(asCustomer, () =>
      online.svc.create({ orderId: 'o1', method: ONLINE }),
    );
    expect(opened).toMatchObject({
      customerId: 'cust-1',
      amount: TOTAL,
      status: 'PENDING',
      confirmationUrl: 'https://pay.test/checkout',
    });
    expect(online.charges).toHaveLength(1);

    const balance = world();
    balance.fund('user-cust-1', WALLET);
    const paid = await runWithContext(asCustomer, () =>
      balance.svc.create({ orderId: 'o1', method: BALANCE }),
    );
    expect(paid.status).toBe('CAPTURED');
    expect(balance.debits()).toEqual([{ userId: 'user-cust-1', type: 'PAYMENT', amount: -TOTAL }]);
    expect(balance.balanceOf('user-cust-1')).toBe(WALLET - TOTAL);
  });

  it('still fails, rather than overdraws, on a short balance', async () => {
    const w = world();
    w.fund('user-cust-1', 1_000);
    await expect(
      runWithContext(asCustomer, () => w.svc.create({ orderId: 'o1', method: BALANCE })),
    ).rejects.toBeInstanceOf(PaymentFailedError);
    expect(w.debits()).toEqual([]);
  });

  const STRANGERS: Who[] = [
    ['the vendor of the stall', asStallVendor],
    ['the courier of the order', asCourier],
    ['another customer', asOtherCustomer],
    ['another stall’s vendor', asOtherVendor],
    ['a vendor token without a vendorId', asVendorNoId],
    ['a customer token without a customerId', asCustomerNoId],
  ];

  it.each(STRANGERS)('is refused to %s, and the customer’s wallet stays full', async (_, who) => {
    for (const method of [ONLINE, BALANCE, CASH, INVOICE]) {
      const w = world();
      w.fund('user-cust-1', WALLET);
      await expect(
        runWithContext(who, () => w.svc.create({ orderId: 'o1', method })),
      ).rejects.toBeInstanceOf(ForbiddenError);
      expectUntouched(w, { 'user-cust-1': WALLET });
    }
  });

  it.each(DESK)(
    'is something %s may start for a customer, but not out of their wallet',
    async (_, who) => {
      for (const method of [ONLINE, CASH]) {
        const w = world();
        const opened = await runWithContext(who, () => w.svc.create({ orderId: 'o1', method }));
        expect(opened).toMatchObject({ customerId: 'cust-1', method });
      }

      const w = world();
      w.fund('user-cust-1', WALLET);
      await expect(
        runWithContext(who, () => w.svc.create({ orderId: 'o1', method: BALANCE })),
      ).rejects.toBeInstanceOf(ForbiddenError);
      expectUntouched(w, { 'user-cust-1': WALLET });
    },
  );
});

describe('what the platform settles by itself', () => {
  it('records cash at the door with no user, on an order that is already delivered', async () => {
    const w = world({ status: 'DELIVERED' });
    const payment = await runWithContext(asPlatform, () =>
      w.svc.create({ orderId: 'o1', method: CASH }),
    );
    expect(payment).toMatchObject({ customerId: 'cust-1', method: CASH, status: 'PENDING' });

    const captured = await runWithContext(asPlatform, () =>
      w.svc.capture(payment.id, 'user-courier-1'),
    );
    expect(captured.status).toBe('CAPTURED');
    expect(w.ledger).toEqual([
      { userId: 'user-courier-1', type: 'CASH_COLLECTED', amount: -TOTAL },
    ]);
  });

  it('never spends a wallet: a job has no owner to ask', async () => {
    const w = world();
    w.fund('user-cust-1', WALLET);
    await expect(
      runWithContext(asPlatform, () => w.svc.create({ orderId: 'o1', method: BALANCE })),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expectUntouched(w, { 'user-cust-1': WALLET });
  });
});

describe('the B2B invoice flow', () => {
  it.each(DESK)(
    'is %s creating the INVOICE payment and capturing it, even after delivery',
    async (_, who) => {
      const w = world({ status: 'DELIVERED' });
      const payment = await runWithContext(who, () =>
        w.svc.create({ orderId: 'o1', method: INVOICE }),
      );
      expect(payment).toMatchObject({ customerId: 'cust-1', method: INVOICE, status: 'PENDING' });
      const captured = await runWithContext(who, () => w.svc.capture(payment.id));
      expect(captured.status).toBe('CAPTURED');
      expect(w.published).toContain('payment.captured');
    },
  );

  it('is not the stall vendor’s to mark paid, although the route asks only for order:update', async () => {
    // `POST /orders/:id/invoice-paid` opens the INVOICE payment through this very call.
    const w = world({ status: 'DELIVERED' });
    await expect(
      runWithContext(asStallVendor, () => w.svc.create({ orderId: 'o1', method: INVOICE })),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expectUntouched(w);
  });
});

// ---------------------------------------------------------------- Plus

describe('a Bazar Plus month', () => {
  const subject = `plus:cust-1:${DAY}`;

  it('is bought by the customer for themselves: online, and from their balance', async () => {
    const online = world();
    const opened = await runWithContext(asCustomer, () =>
      online.svc.create({ subject, method: ONLINE }),
    );
    expect(opened).toMatchObject({
      purpose: 'PLUS',
      customerId: 'cust-1',
      amount: PLUS.PRICE_MINOR,
    });

    const balance = world();
    balance.fund('user-cust-1', WALLET);
    const paid = await runWithContext(asCustomer, () =>
      balance.svc.create({ subject, method: BALANCE }),
    );
    expect(paid.status).toBe('CAPTURED');
    expect(balance.debits()).toEqual([
      { userId: 'user-cust-1', type: 'PAYMENT', amount: -PLUS.PRICE_MINOR },
    ]);
  });

  const STRANGERS: Who[] = [
    ['another customer', asOtherCustomer],
    ['a vendor', asStallVendor],
    ['a courier', asCourier],
    ['a customer token without a customerId', asCustomerNoId],
  ];

  it.each(STRANGERS)(
    'is not bought for someone else by %s, nor out of their wallet',
    async (_, who) => {
      for (const method of [ONLINE, BALANCE]) {
        const w = world();
        w.fund('user-cust-1', WALLET);
        await expect(
          runWithContext(who, () => w.svc.create({ subject, method })),
        ).rejects.toBeInstanceOf(ForbiddenError);
        expectUntouched(w, { 'user-cust-1': WALLET });
      }
    },
  );

  it.each(DESK)('may be bought for a customer by %s', async (_, who) => {
    const w = world();
    const opened = await runWithContext(who, () => w.svc.create({ subject, method: ONLINE }));
    expect(opened).toMatchObject({ purpose: 'PLUS', customerId: 'cust-1' });
  });
});

// ---------------------------------------------------------------- tips

describe('a tip', () => {
  const subject = `tip:o1:${TIP}`;

  it('is left by the customer of a delivered order: online, and from their balance', async () => {
    const online = world({ status: 'DELIVERED' });
    const opened = await runWithContext(asCustomer, () =>
      online.svc.create({ subject, method: ONLINE }),
    );
    expect(opened).toMatchObject({
      purpose: 'TIP',
      orderId: 'o1',
      customerId: 'cust-1',
      amount: TIP,
    });

    const balance = world({ status: 'DELIVERED' });
    balance.fund('user-cust-1', WALLET);
    const paid = await runWithContext(asCustomer, () =>
      balance.svc.create({ subject, method: BALANCE }),
    );
    expect(paid.status).toBe('CAPTURED');
    expect(balance.debits()).toEqual([{ userId: 'user-cust-1', type: 'PAYMENT', amount: -TIP }]);
  });

  const NOT_DELIVERED = ['PENDING', 'CONFIRMED', 'PICKED_UP', 'IN_DELIVERY', 'CANCELLED', 'FAILED'];

  it('has to wait for the delivery: before it nobody, the desk included, may leave one', async () => {
    for (const status of NOT_DELIVERED) {
      for (const who of [asCustomer, asAdmin]) {
        const w = world({ status });
        w.fund('user-cust-1', WALLET);
        await expect(
          runWithContext(who, () => w.svc.create({ subject, method: BALANCE })),
        ).rejects.toBeInstanceOf(ConflictError);
        expectUntouched(w, { 'user-cust-1': WALLET });
      }
    }
  });

  const STRANGERS: Who[] = [
    ['the courier of the order', asCourier],
    ['the vendor of the stall', asStallVendor],
    ['another customer', asOtherCustomer],
    ['a customer token without a customerId', asCustomerNoId],
  ];

  it.each(STRANGERS)('is not left in the customer’s name by %s', async (_, who) => {
    for (const method of [ONLINE, BALANCE]) {
      const w = world({ status: 'DELIVERED' });
      w.fund('user-cust-1', WALLET);
      await expect(
        runWithContext(who, () => w.svc.create({ subject, method })),
      ).rejects.toBeInstanceOf(ForbiddenError);
      expectUntouched(w, { 'user-cust-1': WALLET });
    }
  });
});

// ---------------------------------------------------------------- promotions

describe('a stall promotion', () => {
  const subject = `promo:store-1:${DAY}`;

  it('is bought by the vendor of that stall, who gets a payer profile on the first purchase', async () => {
    const w = world();
    const opened = await runWithContext(asStallVendor, () =>
      w.svc.create({ subject, method: ONLINE }),
    );
    expect(opened).toMatchObject({
      purpose: 'PROMO',
      customerId: 'cust-user-vendor-stall',
      amount: PROMOTION.PRICE_MINOR,
    });
    expect(w.madeProfiles).toEqual(['user-vendor-stall']);

    // The next purchase finds the profile instead of making another.
    const again = world({ vendorProfile: true });
    await runWithContext(asStallVendor, () => again.svc.create({ subject, method: ONLINE }));
    expect(again.madeProfiles).toEqual([]);
  });

  it('is paid from the vendor’s own balance', async () => {
    const w = world({ vendorProfile: true });
    w.fund('user-vendor-stall', WALLET);
    const paid = await runWithContext(asStallVendor, () =>
      w.svc.create({ subject, method: BALANCE }),
    );
    expect(paid.status).toBe('CAPTURED');
    expect(w.debits()).toEqual([
      { userId: 'user-vendor-stall', type: 'PAYMENT', amount: -PROMOTION.PRICE_MINOR },
    ]);
  });

  const STRANGERS: Who[] = [
    ['another stall’s vendor', asOtherVendor],
    ['a vendor token without a vendorId', asVendorNoId],
    ['a customer', asCustomer],
    ['a courier', asCourier],
  ];

  it.each(STRANGERS)(
    'is refused to %s, and nobody’s wallet or profile is touched',
    async (_, who) => {
      for (const method of [ONLINE, BALANCE]) {
        const known = world({ vendorProfile: true });
        known.fund('user-vendor-stall', WALLET);
        await expect(
          runWithContext(who, () => known.svc.create({ subject, method })),
        ).rejects.toBeInstanceOf(ForbiddenError);
        expectUntouched(known, { 'user-vendor-stall': WALLET });
        expect(known.madeProfiles).toEqual([]);

        // A vendor who has never bought one has no profile yet: a stranger must not make it.
        const fresh = world();
        await expect(
          runWithContext(who, () => fresh.svc.create({ subject, method })),
        ).rejects.toBeInstanceOf(AppError);
        expectUntouched(fresh);
        expect(fresh.madeProfiles).toEqual([]);
      }
    },
  );

  it.each(DESK)(
    'is bought for a vendor by %s only once the vendor has a profile',
    async (_, who) => {
      const known = world({ vendorProfile: true });
      const opened = await runWithContext(who, () => known.svc.create({ subject, method: ONLINE }));
      expect(opened).toMatchObject({ purpose: 'PROMO', customerId: 'cust-vendor-stall' });

      const fresh = world();
      await expect(
        runWithContext(who, () => fresh.svc.create({ subject, method: ONLINE })),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(fresh.madeProfiles).toEqual([]);
    },
  );

  it('is looked up inside the tenant: a stall of another tenant is not there', async () => {
    const w = world();
    await expect(
      runWithContext(asAdmin, () =>
        w.svc.create({ subject: `promo:store-foreign:${DAY}`, method: ONLINE }),
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
    expectUntouched(w);
    expect(w.madeProfiles).toEqual([]);
  });
});

// ---------------------------------------------------------------- reading

describe('reading the list of payments', () => {
  const list = (w: World, who: RequestContext, filters: Record<string, unknown> = {}) =>
    runWithContext(who, () => w.svc.list(filters));

  it.each(DESK)('gives %s the filters they asked for and nothing more', async (_, who) => {
    const w = world();
    await list(w, who, { orderId: 'o1', status: 'CAPTURED' });
    await list(w, who, { customerId: 'cust-2' });
    expect(w.listed).toEqual([{ orderId: 'o1', status: 'CAPTURED' }, { customerId: 'cust-2' }]);
  });

  it('is a customer’s own payments, whatever filter they send', async () => {
    const w = world();
    await list(w, asCustomer, { orderId: 'o1' });
    await list(w, asCustomer, { customerId: 'cust-2' });
    expect(w.listed).toEqual([{ orderId: 'o1', customerId: 'cust-1' }, { customerId: 'cust-1' }]);
  });

  it('is a vendor’s own too, once a purchase has given them a customer profile', async () => {
    const w = world();
    const vendor = as('vendor-stall', [ROLE.VENDOR], {
      vendorId: 'vendor-stall',
      customerId: 'cust-vendor-stall',
    });
    await list(w, vendor, { customerId: 'cust-1' });
    expect(w.listed).toEqual([{ customerId: 'cust-vendor-stall' }]);
  });

  const NOT_THEIRS: Who[] = [
    ['a vendor token without a customer profile', asVendorNoId],
    ['a stall vendor without a customer profile', asStallVendor],
    ['a customer token without a customerId', asCustomerNoId],
    ['a courier', asCourier],
  ];

  it.each(NOT_THEIRS)('is refused to %s — no id is not "no scope"', async (_, who) => {
    const w = world();
    await expect(list(w, who)).rejects.toBeInstanceOf(ForbiddenError);
    expect(w.listed).toEqual([]);
  });
});

describe('reading one payment', () => {
  it('is the payer’s and the desk’s, nobody else’s', async () => {
    const w = world();
    const payment = await runWithContext(asCustomer, () =>
      w.svc.create({ orderId: 'o1', method: ONLINE }),
    );
    const get = (who: RequestContext) => runWithContext(who, () => w.svc.get(payment.id));

    for (const who of [asCustomer, asAdmin, asOperator]) {
      await expect(get(who)).resolves.toMatchObject({ id: payment.id });
    }
    for (const who of [asOtherCustomer, asStallVendor, asCourier, asCustomerNoId]) {
      await expect(get(who)).rejects.toBeInstanceOf(ForbiddenError);
    }
  });
});

// ---------------------------------------------------------------- provider callbacks

describe('provider callbacks, which carry no user', () => {
  const KEY = 'merchant-key';
  const basic = `Basic ${Buffer.from(`Paycom:${KEY}`).toString('base64')}`;

  function callbacks(w: World) {
    const payme = new PaymeMerchantApi({
      repository: w.repository as never,
      payments: w.svc,
      logger: w.logger as never,
    });
    const click = new ClickShopApi({
      repository: w.repository as never,
      payments: w.svc,
      logger: w.logger as never,
      settings: { serviceId: '42', secretKey: 'secret' },
    });
    const controller = new PaymentsController(w.svc, payme, KEY, click);

    const rpc = async (method: string, params: Record<string, unknown>) => {
      let sent: unknown;
      const reply = {
        code: () => reply,
        send: (value: unknown) => {
          sent = value;
          return value;
        },
      };
      await runWithContext(asWebhook, () =>
        controller.paymeRpc(
          {
            headers: { authorization: basic },
            body: JSON.stringify({ id: 1, method, params }),
          } as never,
          reply as never,
        ),
      );
      return sent as { result?: Record<string, unknown>; error?: { code: number } };
    };

    const clickCall = async (fields: Record<string, string>) => {
      let sent: unknown;
      const reply = {
        code: () => reply,
        send: (value: unknown) => {
          sent = value;
          return value;
        },
      };
      const withPrepare = fields['action'] === '1';
      const sign = createHash('md5')
        .update(
          [
            fields['click_trans_id'],
            fields['service_id'],
            'secret',
            fields['merchant_trans_id'],
            ...(withPrepare ? [fields['merchant_prepare_id']] : []),
            fields['amount'],
            fields['action'],
            fields['sign_time'],
          ].join(''),
        )
        .digest('hex');
      await runWithContext(asWebhook, () =>
        controller.clickShop({ body: { ...fields, sign_string: sign } } as never, reply as never),
      );
      return sent as { error: number; merchant_prepare_id?: number };
    };

    return { rpc, clickCall };
  }

  it('Payme checks an order, a Plus month and a promo that have a payer', async () => {
    const w = world({ vendorProfile: true });
    const { rpc } = callbacks(w);
    const check = (order_id: string, amount: number) =>
      rpc('CheckPerformTransaction', { amount, account: { order_id } });

    expect(await check('o1', TOTAL)).toMatchObject({ result: { allow: true } });
    expect(await check(`plus:cust-1:${DAY}`, PLUS.PRICE_MINOR)).toMatchObject({
      result: { allow: true },
    });
    expect(await check(`promo:store-1:${DAY}`, PROMOTION.PRICE_MINOR)).toMatchObject({
      result: { allow: true },
    });
    expectUntouched(w);
    expect(w.madeProfiles).toEqual([]);
  });

  it('Payme checks a tip once the order is delivered', async () => {
    const w = world({ status: 'DELIVERED' });
    const { rpc } = callbacks(w);
    const res = await rpc('CheckPerformTransaction', {
      amount: TIP,
      account: { order_id: `tip:o1:${TIP}` },
    });
    expect(res).toMatchObject({ result: { allow: true } });
  });

  it('Payme answers “order closed” for a tip before the delivery', async () => {
    const w = world({ status: 'IN_DELIVERY' });
    const { rpc } = callbacks(w);
    const res = await rpc('CheckPerformTransaction', {
      amount: TIP,
      account: { order_id: `tip:o1:${TIP}` },
    });
    expect(res.error?.code).toBe(PAYME_ERROR.ORDER_CLOSED);
  });

  it('a callback makes no profile for a vendor who never started the purchase', async () => {
    const w = world();
    const { rpc } = callbacks(w);
    const res = await rpc('CheckPerformTransaction', {
      amount: PROMOTION.PRICE_MINOR,
      account: { order_id: `promo:store-1:${DAY}` },
    });
    expect(res.error?.code).toBe(PAYME_ERROR.ORDER_NOT_FOUND);
    expect(w.madeProfiles).toEqual([]);
    expectUntouched(w);
  });

  it('Payme creates and performs a payment for an order with no user at all', async () => {
    const w = world();
    const { rpc } = callbacks(w);
    const account = { order_id: 'o1' };
    const created = await rpc('CreateTransaction', {
      id: 'tx-1',
      time: Date.now(),
      amount: TOTAL,
      account,
    });
    expect(created.result).toMatchObject({ state: 1 });
    const performed = await rpc('PerformTransaction', { id: 'tx-1' });
    expect(performed.result).toMatchObject({ state: 2 });
    expect(w.payments).toEqual([
      expect.objectContaining({ customerId: 'cust-1', provider: 'payme', status: 'CAPTURED' }),
    ]);
    expect(w.published).toContain('payment.captured');
  });

  it('Click prepares and completes an order the same way', async () => {
    const w = world();
    const { clickCall } = callbacks(w);
    const base = {
      click_trans_id: '555',
      service_id: '42',
      merchant_trans_id: 'o1',
      amount: String(TOTAL / 100),
      sign_time: '2026-10-01 12:00:00',
      error: '0',
      error_note: 'Success',
    };
    const prepared = await clickCall({ ...base, action: '0' });
    expect(prepared.error).toBe(0);
    const done = await clickCall({
      ...base,
      action: '1',
      merchant_prepare_id: String(prepared.merchant_prepare_id),
    });
    expect(done.error).toBe(0);
    expect(w.payments).toEqual([
      expect.objectContaining({ customerId: 'cust-1', provider: 'click', status: 'CAPTURED' }),
    ]);
  });

  it('resolves every kind of payable with no user in the context', async () => {
    const w = world({ status: 'DELIVERED', vendorProfile: true });
    const resolve = (subject: string) =>
      runWithContext(asPlatform, () => w.svc.resolvePayable(subject));

    expect(await resolve('o1')).toMatchObject({
      purpose: 'ORDER',
      customerId: 'cust-1',
      closed: true,
    });
    expect(await resolve(`plus:cust-1:${DAY}`)).toMatchObject({
      purpose: 'PLUS',
      customerId: 'cust-1',
    });
    expect(await resolve(`tip:o1:${TIP}`)).toMatchObject({ purpose: 'TIP', closed: false });
    expect(await resolve(`promo:store-1:${DAY}`)).toMatchObject({
      purpose: 'PROMO',
      customerId: 'cust-vendor-stall',
    });
  });
});
