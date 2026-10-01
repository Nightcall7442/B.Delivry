/**
 * Settling money is for the platform and the desk, and a provider's callback is believed only as
 * far as its signature, its tenant, its provider and its amount go. `capture()` had no caller
 * check at all, `handleWebhook` found the payment by the provider's id alone — in any tenant, from
 * any provider — and set any status it was told, a second capture could race the first into a
 * second cash debt on the courier, and two refunds of one payment could each be told there was
 * still enough left. The Payme and Click endpoints accepted a blank key as if it were a key.
 *
 * Real PaymentsService, PaymentsRepository, PaymeMerchantApi and ClickShopApi; the database, the
 * provider and the order service are fakes.
 */
import { effectivePermissions, type AuthenticatedUser } from '@bazar/auth';
import { PAYMENT_METHOD, ROLE, type Role } from '@bazar/constants';
import { money } from '@bazar/payments';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  ConflictError,
  ForbiddenError,
  PaymentFailedError,
  UnauthorizedError,
} from '../../src/common/errors/index.js';
import { requireContext, runWithContext } from '../../src/common/tenant/tenant-context.js';
import { systemContext, type RequestContext } from '../../src/common/types/request-context.js';
import { PaymentsController } from '../../src/modules/payments/controller/payments.controller.js';
import { PaymentsRepository } from '../../src/modules/payments/repository/payments.repository.js';
import { ClickShopApi } from '../../src/modules/payments/service/click-shop.js';
import {
  PAYME_ERROR,
  PaymeMerchantApi,
} from '../../src/modules/payments/service/payme-merchant.js';
import { PaymentsService } from '../../src/modules/payments/service/payments.service.js';

const TENANT = 't1';
const TOTAL = 5_000_000;

// ---------------------------------------------------------------- people

const ctx = (user: AuthenticatedUser | null, tenantId = TENANT): RequestContext => ({
  requestId: 'r1',
  tenantId,
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
const asVendor = as('vendor-1', [ROLE.VENDOR], { vendorId: 'vendor-1' });
const asCourier = as('courier-1', [ROLE.COURIER], { courierId: 'courier-1' });
const asAdmin = as('admin', [ROLE.ADMIN]);
const asOperator = as('operator', [ROLE.OPERATOR]);
const asPlatform = systemContext(TENANT, 'job', 'ru');
/** What a public webhook request carries until the service has checked the signature. */
const asAnonymous = ctx(null);

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

function world() {
  const order = {
    id: 'o1',
    number: 'BZ-1',
    tenantId: TENANT,
    customerId: 'cust-1',
    courierId: 'courier-1',
    store: { vendorId: 'vendor-1' },
    status: 'CONFIRMED',
    paymentStatus: 'PENDING',
    currency: 'UZS',
    total: TOTAL,
  };

  const payments: Row[] = [];
  const ledger: { userId: string; type: string; amount: number }[] = [];
  const published: string[] = [];
  const transactions: { paymentId: string; type: string; raw: unknown; idempotencyKey: string }[] =
    [];
  const providerCalls: string[] = [];
  let refundResult: 'REFUNDED' | 'FAILED' = 'REFUNDED';
  let seq = 0;

  const row = (over: Partial<Row> = {}): Row => {
    const made = {
      id: `pay-${++seq}`,
      tenantId: TENANT,
      orderId: 'o1',
      purpose: 'ORDER',
      subject: 'o1',
      customerId: 'cust-1',
      method: PAYMENT_METHOD.ONLINE,
      provider: 'uzum',
      status: 'AUTHORIZED',
      amount: TOTAL,
      refundedAmount: 0,
      currency: 'UZS',
      externalId: `ext-${seq}`,
      confirmationUrl: null,
      paidAt: null,
      failureReason: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...over,
    } as Row;
    payments.push(made);
    return made;
  };

  // A serializable transaction retries the loser until it sees the winner's write; running them
  // one after the other is the same outcome.
  let chain: Promise<unknown> = Promise.resolve();
  const prisma = {
    async $transaction<T>(fn: (tx: unknown) => Promise<T>) {
      const run = chain.then(() => fn({}));
      chain = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    },
  };

  /** The tenant the call runs in: what the real repository scopes every query by. */
  const tenantOf = () => requireContext().tenantId;

  const repository = {
    async create(data: Record<string, unknown>) {
      return row({ status: 'PENDING', externalId: null, ...(data as Partial<Row>) });
    },
    async findById(id: string) {
      return payments.find((p) => p.id === id && p.tenantId === tenantOf()) ?? null;
    },
    // What the real one does since the fix: the tenant of the call, and the provider asked for.
    async findByExternalId(externalId: string, provider?: string) {
      return (
        payments.find(
          (p) =>
            p.externalId === externalId &&
            p.tenantId === tenantOf() &&
            (provider === undefined || p.provider === provider),
        ) ?? null
      );
    },
    async findBySubject(subject: string) {
      return payments.filter((p) => p.subject === subject && p.tenantId === tenantOf());
    },
    async list() {
      return { items: payments, pagination: { page: 1, pageSize: 1000, total: 0, totalPages: 1 } };
    },
    async updateStatus(id: string, status: string, extra: Record<string, unknown> = {}) {
      const target = payments.find((p) => p.id === id)!;
      Object.assign(target, extra, { status, updatedAt: new Date() });
      return target;
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
      return customerId === 'cust-1' ? 'user-cust-1' : null;
    },
    async walletBalance() {
      return 0;
    },
    async appendWalletEntry(entry: { userId: string; type: string; amount: { amount: number } }) {
      ledger.push({ userId: entry.userId, type: entry.type, amount: entry.amount.amount });
      return {};
    },
    // Both refund bookkeeping shapes: the claim in one statement, and the old increment.
    async reserveRefund(id: string, amount: number, total: number) {
      const target = payments.find((p) => p.id === id)!;
      if (!['CAPTURED', 'PARTIALLY_REFUNDED'].includes(target.status)) return false;
      if (target.refundedAmount > total - amount) return false;
      target.refundedAmount += amount;
      return true;
    },
    async releaseRefund(id: string, amount: number) {
      payments.find((p) => p.id === id)!.refundedAmount -= amount;
    },
    async addRefunded(id: string, amount: number) {
      payments.find((p) => p.id === id)!.refundedAmount += amount;
    },
  };

  const orders = {
    async get() {
      return order;
    },
    totalsOf: () => ({ total: money(order.total, 'UZS') }),
  };

  /** A webhook body is `{ externalId, status, amount? }`, and its "signature" is `valid`. */
  const provider = (id: string) => ({
    id,
    async createPayment() {
      return { status: 'PENDING', externalId: null, raw: {} };
    },
    async capture(externalId: string) {
      providerCalls.push(`capture:${id}:${externalId}`);
      return { status: 'CAPTURED', externalId, raw: {} };
    },
    async refund(externalId: string, amount: { amount: number; currency: string }) {
      providerCalls.push(`refund:${id}:${externalId}`);
      return { status: refundResult, externalId, refundedAmount: amount };
    },
    async verifyWebhook(request: { rawBody: string }) {
      const body = JSON.parse(request.rawBody) as {
        valid: boolean;
        externalId?: string;
        status?: string;
        amount?: number;
      };
      return {
        valid: body.valid,
        externalId: body.externalId ?? null,
        status: body.status ?? null,
        ...(body.amount !== undefined
          ? { amount: { amount: body.amount, currency: 'UZS' as const } }
          : {}),
      };
    },
  });

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
      ['uzum', provider('uzum')],
      ['payme', provider('payme')],
      ['click', provider('click')],
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
    transactions,
    providerCalls,
    row,
    failRefunds: () => {
      refundResult = 'FAILED';
    },
    allowRefunds: () => {
      refundResult = 'REFUNDED';
    },
  };
}

type World = ReturnType<typeof world>;

const hook = (body: Record<string, unknown>) => ({
  headers: {},
  rawBody: JSON.stringify({ valid: true, ...body }),
});

const statusOf = (w: World, id: string) => w.payments.find((p) => p.id === id)?.status;

// ---------------------------------------------------------------- who may settle

describe('settling a payment', () => {
  const NOT_THE_DESK: [string, RequestContext][] = [
    ['the customer who owes it', asCustomer],
    ['the vendor of the stall', asVendor],
    ['the courier of the order', asCourier],
  ];

  it.each(NOT_THE_DESK)('is not %s’s to do, even for their own payment', async (_, who) => {
    for (const method of [PAYMENT_METHOD.CASH, PAYMENT_METHOD.INVOICE, PAYMENT_METHOD.ONLINE]) {
      const w = world();
      const payment = w.row({ method, provider: 'uzum', status: 'PENDING' });
      await expect(runWithContext(who, () => w.svc.capture(payment.id))).rejects.toBeInstanceOf(
        ForbiddenError,
      );
      expect(statusOf(w, payment.id)).toBe('PENDING');
      expect(w.published).toEqual([]);
      expect(w.providerCalls).toEqual([]);
    }
  });

  it('is not a signed-out caller’s either', async () => {
    const w = world();
    const payment = w.row({ method: PAYMENT_METHOD.CASH, provider: 'cash', status: 'PENDING' });
    await expect(
      runWithContext(asAnonymous, () => w.svc.capture(payment.id)),
    ).rejects.toBeInstanceOf(UnauthorizedError);
    expect(statusOf(w, payment.id)).toBe('PENDING');
  });

  it.each([
    ['an admin', asAdmin],
    ['an operator', asOperator],
    ['the platform', asPlatform],
  ] as [string, RequestContext][])('is something %s does for a bank transfer', async (_, who) => {
    const w = world();
    const payment = w.row({
      method: PAYMENT_METHOD.INVOICE,
      provider: 'invoice',
      status: 'PENDING',
    });
    const captured = await runWithContext(who, () => w.svc.capture(payment.id));
    expect(captured.status).toBe('CAPTURED');
    expect(w.published).toEqual(['payment.captured']);
  });

  it.each(['CANCELLED', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED'])(
    'is not done to a %s payment: a late callback does not bring it back',
    async (status) => {
      const w = world();
      const payment = w.row({ status });
      await expect(
        runWithContext(asPlatform, () => w.svc.capture(payment.id)),
      ).rejects.toBeInstanceOf(ConflictError);
      expect(statusOf(w, payment.id)).toBe(status);
      expect(w.published).toEqual([]);
    },
  );

  it('is not done to a gateway payment the gateway never opened a transaction for', async () => {
    const w = world();
    const payment = w.row({ status: 'PENDING', externalId: null });
    await expect(
      runWithContext(asPlatform, () => w.svc.capture(payment.id)),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(statusOf(w, payment.id)).toBe('PENDING');
    expect(w.providerCalls).toEqual([]);
  });

  it('happens once when two captures race: one cash debt on the courier, one event', async () => {
    const w = world();
    const payment = w.row({
      method: PAYMENT_METHOD.CASH,
      provider: 'cash',
      status: 'PENDING',
      externalId: null,
    });
    const [a, b] = await Promise.all([
      runWithContext(asPlatform, () => w.svc.capture(payment.id, 'user-courier-1')),
      runWithContext(asPlatform, () => w.svc.capture(payment.id, 'user-courier-1')),
    ]);
    expect([a.status, b.status]).toEqual(['CAPTURED', 'CAPTURED']);
    expect(w.ledger).toEqual([
      { userId: 'user-courier-1', type: 'CASH_COLLECTED', amount: -TOTAL },
    ]);
    expect(w.published).toEqual(['payment.captured']);
  });
});

// ---------------------------------------------------------------- provider callbacks

describe('a provider’s webhook', () => {
  const settle = (w: World, body: Record<string, unknown>, who = asAnonymous) =>
    runWithContext(who, () => w.svc.handleWebhook('uzum', hook(body)));

  it('refuses a bad signature before it touches anything', async () => {
    const w = world();
    const payment = w.row();
    await expect(
      settle(w, {
        valid: false,
        externalId: payment.externalId,
        status: 'CAPTURED',
        amount: TOTAL,
      }),
    ).rejects.toMatchObject({ httpStatus: 401 });
    expect(statusOf(w, payment.id)).toBe('AUTHORIZED');
    expect(w.published).toEqual([]);
  });

  it('settles a payment at the amount that was asked for, with no user on the request', async () => {
    const w = world();
    const payment = w.row();
    await settle(w, { externalId: payment.externalId, status: 'CAPTURED', amount: TOTAL });
    expect(statusOf(w, payment.id)).toBe('CAPTURED');
    expect(w.published).toEqual(['payment.captured']);
  });

  it('does not settle at another amount, nor at none at all', async () => {
    for (const amount of [TOTAL - 1, 1, undefined]) {
      const w = world();
      const payment = w.row();
      await expect(
        settle(w, {
          externalId: payment.externalId,
          status: 'CAPTURED',
          ...(amount !== undefined ? { amount } : {}),
        }),
      ).rejects.toBeInstanceOf(ConflictError);
      expect(statusOf(w, payment.id)).toBe('AUTHORIZED');
      expect(w.published).toEqual([]);
    }
  });

  it('does not touch a payment of another provider that carries the same transaction id', async () => {
    const w = world();
    const clicks = w.row({ provider: 'click', externalId: 'shared-id' });
    await settle(w, { externalId: 'shared-id', status: 'CAPTURED', amount: TOTAL });
    expect(statusOf(w, clicks.id)).toBe('AUTHORIZED');
    expect(w.published).toEqual([]);
  });

  it('does not touch a payment of another tenant that carries the same transaction id', async () => {
    const w = world();
    const foreign = w.row({ tenantId: 't2', externalId: 'shared-id' });
    await settle(w, { externalId: 'shared-id', status: 'CAPTURED', amount: TOTAL });
    expect(statusOf(w, foreign.id)).toBe('AUTHORIZED');
    expect(w.published).toEqual([]);
  });

  it('never walks a payment backwards: a replayed or reordered callback is ignored', async () => {
    const backwards: [string, string][] = [
      ['CAPTURED', 'AUTHORIZED'],
      ['CAPTURED', 'FAILED'],
      ['CAPTURED', 'CANCELLED'],
      ['CAPTURED', 'PENDING'],
      ['REFUNDED', 'FAILED'],
      ['REFUNDED', 'AUTHORIZED'],
      ['FAILED', 'AUTHORIZED'],
      ['CANCELLED', 'AUTHORIZED'],
      ['AUTHORIZED', 'REFUNDED'],
      ['PENDING', 'REFUNDED'],
    ];
    for (const [from, to] of backwards) {
      const w = world();
      const payment = w.row({ status: from });
      await settle(w, { externalId: payment.externalId, status: to, amount: TOTAL });
      expect(statusOf(w, payment.id), `${from} -> ${to}`).toBe(from);
    }
  });

  it('still moves a payment forward: authorized, failed, cancelled, refunded', async () => {
    const forwards: [string, string][] = [
      ['PENDING', 'AUTHORIZED'],
      ['PENDING', 'FAILED'],
      ['AUTHORIZED', 'FAILED'],
      ['AUTHORIZED', 'CANCELLED'],
      ['CAPTURED', 'REFUNDED'],
    ];
    for (const [from, to] of forwards) {
      const w = world();
      const payment = w.row({ status: from });
      await settle(w, { externalId: payment.externalId, status: to, amount: TOTAL });
      expect(statusOf(w, payment.id), `${from} -> ${to}`).toBe(to);
    }
  });

  it('is acknowledged, not repeated, when it lands on the state already held', async () => {
    const w = world();
    const payment = w.row({ status: 'CAPTURED' });
    await settle(w, { externalId: payment.externalId, status: 'CAPTURED', amount: TOTAL });
    expect(w.published).toEqual([]);
  });
});

describe('the payments table a callback is looked up in', () => {
  /** Prisma, as far as one lookup or write goes: it records what it was asked. */
  function recording() {
    const calls: { op: string; args: Record<string, unknown> }[] = [];
    const record = (op: string, result: unknown) => async (args: Record<string, unknown>) => {
      calls.push({ op, args });
      return result;
    };
    const prisma = {
      payment: {
        findFirst: record('findFirst', null),
        update: record('update', {}),
        updateMany: record('updateMany', { count: 1 }),
      },
      customer: { findFirst: record('customer.findFirst', { userId: 'u1' }) },
    };
    return { repository: new PaymentsRepository(prisma as never), calls };
  }

  const inTenant = <T>(fn: () => Promise<T>) => runWithContext(ctx(null, 't9'), fn);

  it('is searched inside the callback’s tenant and among the calling provider’s payments', async () => {
    const { repository, calls } = recording();
    await inTenant(() => repository.findByExternalId('ext-1', 'click'));
    expect(calls[0]?.args).toEqual({
      where: { externalId: 'ext-1', provider: 'click', tenantId: 't9' },
    });
  });

  it('is written to only inside the tenant, whoever looked the row up', async () => {
    const { repository, calls } = recording();
    await inTenant(() => repository.updateStatus('p1', 'CAPTURED'));
    expect(calls[0]?.args['where']).toEqual({ id: 'p1', tenantId: 't9' });
  });

  it('finds the wallet owner of a customer of this tenant only', async () => {
    const { repository, calls } = recording();
    await inTenant(() => repository.customerUserId('c1'));
    expect(calls[0]?.args['where']).toEqual({ id: 'c1', tenantId: 't9' });
  });

  it('claims a refund in one statement that holds the status and the remaining amount', async () => {
    const { repository, calls } = recording();
    await expect(inTenant(() => repository.reserveRefund('p1', 300, 1000))).resolves.toBe(true);
    expect(calls[0]?.args['where']).toEqual({
      id: 'p1',
      tenantId: 't9',
      status: { in: ['CAPTURED', 'PARTIALLY_REFUNDED'] },
      refundedAmount: { lte: 700 },
    });
  });
});

// ---------------------------------------------------------------- refunds

describe('refunding a payment', () => {
  const refund = (w: World, id: string, amount?: number) =>
    runWithContext(asAdmin, () =>
      w.svc.refund(id, {
        reason: 'customer asked',
        ...(amount !== undefined ? { amount: money(amount, 'UZS') } : {}),
      }),
    );

  it('pays out once when two refunds of the whole payment race', async () => {
    const w = world();
    const payment = w.row({
      method: PAYMENT_METHOD.CASH,
      provider: 'cash',
      status: 'CAPTURED',
      externalId: null,
    });
    const results = await Promise.allSettled([refund(w, payment.id), refund(w, payment.id)]);
    expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(w.ledger).toEqual([{ userId: 'user-cust-1', type: 'REFUND', amount: TOTAL }]);
    expect(w.payments[0]?.refundedAmount).toBe(TOTAL);
    expect(statusOf(w, payment.id)).toBe('REFUNDED');
  });

  it('lets two different partial refunds both through, and no more than the whole', async () => {
    const w = world();
    const payment = w.row({
      method: PAYMENT_METHOD.CASH,
      provider: 'cash',
      status: 'CAPTURED',
      externalId: null,
    });
    await refund(w, payment.id, 3_000_000);
    expect(statusOf(w, payment.id)).toBe('PARTIALLY_REFUNDED');
    await expect(refund(w, payment.id, 2_500_000)).rejects.toBeInstanceOf(ConflictError);
    await refund(w, payment.id, 2_000_000);
    expect(statusOf(w, payment.id)).toBe('REFUNDED');
    expect(w.ledger.map((entry) => entry.amount)).toEqual([3_000_000, 2_000_000]);
  });

  it('gives the claim back when the provider refuses, so the refund can be tried again', async () => {
    const w = world();
    const payment = w.row({ status: 'CAPTURED' });
    w.failRefunds();
    await expect(refund(w, payment.id)).rejects.toBeInstanceOf(PaymentFailedError);
    expect(w.payments[0]?.refundedAmount).toBe(0);
    expect(statusOf(w, payment.id)).toBe('CAPTURED');

    w.allowRefunds();
    await refund(w, payment.id);
    expect(statusOf(w, payment.id)).toBe('REFUNDED');
    expect(w.payments[0]?.refundedAmount).toBe(TOTAL);
  });

  it('is the desk’s with the refund permission, and nobody else’s', async () => {
    const w = world();
    const payment = w.row({ status: 'CAPTURED' });
    for (const who of [asCustomer, asVendor, asCourier, asOperator]) {
      await expect(
        runWithContext(who, () => w.svc.refund(payment.id, { reason: 'no' })),
      ).rejects.toBeInstanceOf(ForbiddenError);
    }
    expect(w.payments[0]?.refundedAmount).toBe(0);
  });
});

// ---------------------------------------------------------------- Payme and Click endpoints

const reply = () => {
  const out: { sent?: unknown } = {};
  const r = {
    code: () => r,
    send: (value: unknown) => {
      out.sent = value;
      return value;
    },
  };
  return { r, out };
};

describe('the Payme endpoint', () => {
  function endpoint(w: World, key: string | undefined) {
    const payme = new PaymeMerchantApi({
      repository: w.repository as never,
      payments: w.svc,
      logger: w.logger as never,
    });
    const controller = new PaymentsController(w.svc, payme, key);
    const call = async (authorization: string | undefined, body: unknown) => {
      const { r, out } = reply();
      await runWithContext(asAnonymous, () =>
        controller.paymeRpc(
          { headers: { authorization }, body: JSON.stringify(body) } as never,
          r as never,
        ),
      );
      return out.sent as { result?: Record<string, unknown>; error?: { code: number } };
    };
    return { call };
  }
  const basic = (key: string) => `Basic ${Buffer.from(`Paycom:${key}`).toString('base64')}`;
  const check = {
    id: 1,
    method: 'CheckPerformTransaction',
    params: { amount: TOTAL, account: { order_id: 'o1' } },
  };

  it('answers with its key, and refuses the wrong one', async () => {
    const w = world();
    const { call } = endpoint(w, 'merchant-key');
    expect((await call(basic('merchant-key'), check)).result).toEqual({ allow: true });
    expect((await call(basic('other'), check)).error?.code).toBe(
      PAYME_ERROR.INSUFFICIENT_PRIVILEGE,
    );
    expect((await call(undefined, check)).error?.code).toBe(PAYME_ERROR.INSUFFICIENT_PRIVILEGE);
  });

  it('is closed when the key is blank: "Paycom:" is a password anyone can type', async () => {
    const w = world();
    const { call } = endpoint(w, '');
    expect((await call(basic(''), check)).error?.code).toBe(PAYME_ERROR.INSUFFICIENT_PRIVILEGE);
    const unset = endpoint(w, undefined);
    expect((await unset.call(basic(''), check)).error?.code).toBe(
      PAYME_ERROR.INSUFFICIENT_PRIVILEGE,
    );
  });

  it('answers a body that is JSON but not a request, instead of failing', async () => {
    const w = world();
    const { call } = endpoint(w, 'merchant-key');
    for (const body of [null, 7, [1, 2]]) {
      expect((await call(basic('merchant-key'), body)).error?.code).toBe(
        PAYME_ERROR.INVALID_REQUEST,
      );
    }
  });
});

describe('Payme and Click transactions', () => {
  function apis(
    w: World,
    click: { serviceId: string; secretKey: string } = { serviceId: '42', secretKey: 'secret' },
  ) {
    const payme = new PaymeMerchantApi({
      repository: w.repository as never,
      payments: w.svc,
      logger: w.logger as never,
    });
    const clickApi = new ClickShopApi({
      repository: w.repository as never,
      payments: w.svc,
      logger: w.logger as never,
      settings: click,
    });
    const asSystem = <T>(fn: () => Promise<T>) => runWithContext(asPlatform, fn);
    return {
      payme: (method: string, params: Record<string, unknown>) =>
        asSystem(() => payme.handle({ id: 1, method, params })),
      click: (fields: Record<string, string>, secret = click.secretKey) => {
        const sign = createHash('md5')
          .update(
            [
              fields['click_trans_id'],
              fields['service_id'],
              secret,
              fields['merchant_trans_id'],
              ...(fields['action'] === '1' ? [fields['merchant_prepare_id']] : []),
              fields['amount'],
              fields['action'],
              fields['sign_time'],
            ].join(''),
          )
          .digest('hex');
        return asSystem(() => clickApi.handle({ ...fields, sign_string: sign }));
      },
    };
  }
  const ACCOUNT = { order_id: 'o1' };
  const clickBase = {
    click_trans_id: '555',
    service_id: '42',
    merchant_trans_id: 'o1',
    amount: String(TOTAL / 100),
    sign_time: '2026-10-01 12:00:00',
    error: '0',
    error_note: 'Success',
  };

  it('Payme does not perform a transaction that is Click’s, whatever the id', async () => {
    const w = world();
    const mine = w.row({ provider: 'click', externalId: 'same-id' });
    const { payme } = apis(w);
    const res = await payme('PerformTransaction', { id: 'same-id' });
    expect('error' in res && res.error.code).toBe(PAYME_ERROR.TRANSACTION_NOT_FOUND);
    expect(statusOf(w, mine.id)).toBe('AUTHORIZED');
  });

  it('Payme settles a transaction at the amount it created, not the one a checkout row held', async () => {
    const w = world();
    // The checkout opened this row while the order cost less; the order was repriced since.
    const pending = w.row({
      provider: 'payme',
      status: 'PENDING',
      externalId: null,
      amount: TOTAL - 100_000,
    });
    const { payme } = apis(w);
    await payme('CreateTransaction', {
      id: 'tx-1',
      time: Date.now(),
      amount: TOTAL,
      account: ACCOUNT,
    });
    expect(w.payments.find((p) => p.id === pending.id)?.amount).toBe(TOTAL);
  });

  it('Click is closed when its secret or its service id is blank', async () => {
    const w = world();
    // The signature an attacker can compute for an empty secret, for a request with no service id.
    const forged = { ...clickBase, service_id: '', action: '0' };
    const { click } = apis(w, { serviceId: '', secretKey: '' });
    expect((await click(forged, '')).error).toBe(-1);
    // A blank secret alone, with the right service id, is closed too.
    const second = apis(world(), { serviceId: '42', secretKey: '' });
    expect((await second.click({ ...clickBase, action: '0' }, '')).error).toBe(-1);
  });

  it('Click does not complete a transaction that is Payme’s, whatever the id', async () => {
    const w = world();
    const theirs = w.row({ provider: 'payme', externalId: '555' });
    // Even one that carries a "prepare id" of the kind Click looks for.
    w.transactions.push({
      paymentId: theirs.id,
      type: 'CHARGE',
      raw: { prepareId: 1 },
      idempotencyKey: 'payme:555:create',
    });
    const { click } = apis(w);
    const done = await click({ ...clickBase, action: '1', merchant_prepare_id: '1' });
    expect(done.error).toBe(-6);
    expect(w.published).toEqual([]);
    expect(statusOf(w, theirs.id)).toBe('AUTHORIZED');
  });

  it('Click does not complete at an amount other than the one it prepared', async () => {
    const w = world();
    const { click } = apis(w);
    const prepared = await click({ ...clickBase, action: '0' });
    expect(prepared.error).toBe(0);

    // The order is repriced between Prepare and Complete, and Click reports the new figure.
    w.order.total = TOTAL + 100_000;
    const done = await click({
      ...clickBase,
      amount: String((TOTAL + 100_000) / 100),
      action: '1',
      merchant_prepare_id: String(prepared.merchant_prepare_id),
    });
    expect(done.error).toBe(-2);
    expect(w.published).toEqual([]);
    expect(w.payments[0]?.status).toBe('AUTHORIZED');
  });

  it('Click settles the prepared amount, once', async () => {
    const w = world();
    const { click } = apis(w);
    const prepared = await click({ ...clickBase, action: '0' });
    const done = await click({
      ...clickBase,
      action: '1',
      merchant_prepare_id: String(prepared.merchant_prepare_id),
    });
    expect(done.error).toBe(0);
    expect(w.payments[0]?.status).toBe('CAPTURED');
    expect(w.published).toEqual(['payment.captured']);
  });
});
