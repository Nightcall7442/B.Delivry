/**
 * The provider callbacks are where money is confirmed on somebody else's
 * word, so the checks that stand between a forged request and a "paid" order
 * get a test each: authentication, the amount, idempotency, and the state
 * machine both providers expect us to keep.
 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ClickShopApi } from '../../src/modules/payments/service/click-shop.js';
import {
  PAYME_ERROR,
  PaymeMerchantApi,
} from '../../src/modules/payments/service/payme-merchant.js';

// ---------------------------------------------------------------- fakes

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

function fakes(order: { id: string; total: number; status: string; paymentStatus: string }) {
  const payments: Row[] = [];
  const transactions: {
    paymentId: string;
    type: string;
    raw: unknown;
    createdAt: Date;
    idempotencyKey: string;
  }[] = [];
  const events: string[] = [];
  let seq = 0;

  const repository = {
    async create(data: Record<string, unknown>) {
      const row = {
        id: `pay-${++seq}`,
        tenantId: 't',
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
    async list() {
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
      transactions.push({ ...data, raw: data.raw ?? null, createdAt: new Date() });
      return true;
    },
    async transactionsOf(paymentId: string) {
      return transactions.filter((t) => t.paymentId === paymentId);
    },
  };

  const orders = {
    async get(id: string) {
      if (id !== order.id) throw new Error('not found');
      return { ...order, customerId: 'cust', currency: 'UZS' };
    },
  };

  const paymentsService = {
    // The real one resolves orders, Plus months and tips; the tests only have the order.
    async resolvePayable(subject: string) {
      if (subject !== order.id) throw new Error('not found');
      return {
        subject,
        purpose: 'ORDER',
        orderId: order.id,
        customerId: 'cust',
        amount: { amount: order.total, currency: 'UZS' },
        description: 'Order',
        paid: order.paymentStatus === 'CAPTURED',
        closed: ['DELIVERED', 'CANCELLED', 'FAILED', 'REFUNDED'].includes(order.status),
        refundable: order.status !== 'DELIVERED',
      };
    },
    async capture(id: string) {
      events.push(`capture:${id}`);
      order.paymentStatus = 'CAPTURED';
      return repository.updateStatus(id, 'CAPTURED', { paidAt: new Date() });
    },
    async refund(id: string) {
      events.push(`refund:${id}`);
      return repository.updateStatus(id, 'REFUNDED');
    },
  };

  const logger = { error() {}, warn() {}, info() {}, debug() {} };
  return { repository, orders, paymentsService, logger, payments, events };
}

const ORDER = () => ({
  id: 'order-1',
  total: 4_989_400,
  status: 'CONFIRMED',
  paymentStatus: 'PENDING',
});

// ---------------------------------------------------------------- Payme

describe('Payme merchant API', () => {
  const build = (order = ORDER()) => {
    const f = fakes(order);
    const api = new PaymeMerchantApi({
      repository: f.repository as never,
      payments: f.paymentsService as never,
      logger: f.logger as never,
    });
    const call = (method: string, params: Record<string, unknown>) =>
      api.handle({ id: 1, method, params });
    return { ...f, api, call, order };
  };
  const account = { order_id: 'order-1' };

  it('refuses the wrong amount and an unknown order', async () => {
    const { call } = build();
    const wrong = await call('CheckPerformTransaction', { amount: 1, account });
    expect('error' in wrong && wrong.error.code).toBe(PAYME_ERROR.WRONG_AMOUNT);
    const missing = await call('CheckPerformTransaction', {
      amount: 4_989_400,
      account: { order_id: 'x' },
    });
    expect('error' in missing && missing.error.code).toBe(PAYME_ERROR.ORDER_NOT_FOUND);
  });

  it('creates once, performs once, and repeats the same answers', async () => {
    const { call, events, order } = build();
    const created = Date.now() - 1000;
    const params = { id: 'tx-1', time: created, amount: 4_989_400, account };
    const first = await call('CreateTransaction', params);
    expect(first).toMatchObject({ result: { state: 1, create_time: created } });

    // Payme retries with a later `time`; the original create_time must come back.
    const again = await call('CreateTransaction', { ...params, time: created + 5000 });
    expect(again).toMatchObject({ result: { state: 1, create_time: created } });

    const other = await call('CreateTransaction', { ...params, id: 'tx-2' });
    expect('error' in other && other.error.code).toBe(PAYME_ERROR.ORDER_BUSY);

    const performed = await call('PerformTransaction', { id: 'tx-1' });
    expect('result' in performed && performed.result).toMatchObject({ state: 2 });
    await call('PerformTransaction', { id: 'tx-1' });
    expect(events.filter((e) => e.startsWith('capture')).length).toBe(1);
    expect(order.paymentStatus).toBe('CAPTURED');

    const check = await call('CheckTransaction', { id: 'tx-1' });
    expect(check).toMatchObject({ result: { state: 2, create_time: created } });
  });

  it('times out a transaction Payme created more than 12 hours ago', async () => {
    const { call } = build();
    const stale = Date.now() - 13 * 60 * 60 * 1000;
    const res = await call('CreateTransaction', {
      id: 'tx-old',
      time: stale,
      amount: 4_989_400,
      account,
    });
    expect(res).toMatchObject({ result: { state: 1 } });
    const retry = await call('CreateTransaction', {
      id: 'tx-old',
      time: stale,
      amount: 4_989_400,
      account,
    });
    expect('error' in retry && retry.error.code).toBe(PAYME_ERROR.CANNOT_PERFORM);
    const check = await call('CheckTransaction', { id: 'tx-old' });
    expect(check).toMatchObject({ result: { state: -1, reason: 4 } });
  });

  it('cancels a created transaction and reports state -1', async () => {
    const { call } = build();
    await call('CreateTransaction', { id: 'tx-9', time: Date.now(), amount: 4_989_400, account });
    const cancelled = await call('CancelTransaction', { id: 'tx-9', reason: 3 });
    expect('result' in cancelled && cancelled.result).toMatchObject({ state: -1 });
    const perform = await call('PerformTransaction', { id: 'tx-9' });
    expect('error' in perform && perform.error.code).toBe(PAYME_ERROR.CANNOT_PERFORM);
  });

  it('answers unknown methods and transactions with the spec codes', async () => {
    const { call } = build();
    const method = await call('Nope', {});
    expect('error' in method && method.error.code).toBe(PAYME_ERROR.METHOD_NOT_FOUND);
    const missing = await call('CheckTransaction', { id: 'ghost' });
    expect('error' in missing && missing.error.code).toBe(PAYME_ERROR.TRANSACTION_NOT_FOUND);
  });
});

// ---------------------------------------------------------------- Click

describe('Click SHOP API', () => {
  const SECRET = 'secret';
  const sign = (fields: Record<string, string>, withPrepare: boolean) =>
    createHash('md5')
      .update(
        [
          fields['click_trans_id'],
          fields['service_id'],
          SECRET,
          fields['merchant_trans_id'],
          ...(withPrepare ? [fields['merchant_prepare_id']] : []),
          fields['amount'],
          fields['action'],
          fields['sign_time'],
        ].join(''),
      )
      .digest('hex');
  const base = {
    click_trans_id: '555',
    service_id: '42',
    merchant_trans_id: 'order-1',
    amount: '49894.00',
    sign_time: '2026-09-12 12:00:00',
    error: '0',
    error_note: 'Success',
  };
  const build = (order = ORDER()) => {
    const f = fakes(order);
    const api = new ClickShopApi({
      repository: f.repository as never,
      payments: f.paymentsService as never,
      logger: f.logger as never,
      settings: { serviceId: '42', secretKey: SECRET },
    });
    return { ...f, api, order };
  };

  it('rejects a bad signature before looking at anything else', async () => {
    const { api } = build();
    const res = await api.handle({ ...base, action: '0', sign_string: 'nope' });
    expect(res.error).toBe(-1);
  });

  it('rejects a wrong amount', async () => {
    const { api } = build();
    const fields = { ...base, action: '0', amount: '10.00' };
    const res = await api.handle({ ...fields, sign_string: sign(fields, false) });
    expect(res.error).toBe(-2);
  });

  it('prepares, completes once, then reports already paid', async () => {
    const { api, events, order } = build();
    const prepare = { ...base, action: '0' };
    const prepared = await api.handle({ ...prepare, sign_string: sign(prepare, false) });
    expect(prepared.error).toBe(0);
    expect(prepared.merchant_prepare_id).toBeGreaterThan(0);

    const complete = {
      ...base,
      action: '1',
      merchant_prepare_id: String(prepared.merchant_prepare_id),
    };
    const done = await api.handle({ ...complete, sign_string: sign(complete, true) });
    expect(done.error).toBe(0);
    expect(done.merchant_confirm_id).toBe(prepared.merchant_prepare_id);
    expect(order.paymentStatus).toBe('CAPTURED');
    expect(events).toEqual(['capture:pay-1']);

    const again = await api.handle({ ...complete, sign_string: sign(complete, true) });
    expect(again.error).toBe(-4);
  });

  it('marks the payment cancelled when Click reports its own error', async () => {
    const { api, payments } = build();
    const prepare = { ...base, action: '0' };
    const prepared = await api.handle({ ...prepare, sign_string: sign(prepare, false) });
    const complete = {
      ...base,
      action: '1',
      error: '-5017',
      error_note: 'Declined',
      merchant_prepare_id: String(prepared.merchant_prepare_id),
    };
    const res = await api.handle({ ...complete, sign_string: sign(complete, true) });
    expect(res.error).toBe(-9);
    expect(payments[0]?.status).toBe('CANCELLED');
  });
});
