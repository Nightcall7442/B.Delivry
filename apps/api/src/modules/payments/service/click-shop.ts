/**
 * Click SHOP API — the two callbacks Click makes while a customer pays on
 * my.click.uz: Prepare (may this order be paid for this amount?) and
 * Complete (the money moved, or the customer gave up). Both are signed with
 * an MD5 over the fields and the merchant secret; both answer with Click's
 * flat JSON and its own error codes.
 */
import { PAYMENT_METHOD, PAYMENT_STATUS } from '@bazar/constants';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { Logger } from '../../../infrastructure/logger/index.js';
import type { PaymentsRepository } from '../repository/payments.repository.js';
import type { Payable } from '../types/index.js';
import type { PaymentsService } from './payments.service.js';

export const CLICK_ERROR = {
  SUCCESS: 0,
  SIGN_CHECK_FAILED: -1,
  INCORRECT_AMOUNT: -2,
  ACTION_NOT_FOUND: -3,
  ALREADY_PAID: -4,
  USER_NOT_FOUND: -5,
  TRANSACTION_NOT_FOUND: -6,
  FAILED_TO_UPDATE: -7,
  BAD_REQUEST: -8,
  TRANSACTION_CANCELLED: -9,
} as const;

const ACTION = { PREPARE: 0, COMPLETE: 1 } as const;

export interface ClickRequest {
  click_trans_id?: string;
  service_id?: string;
  click_paydoc_id?: string;
  merchant_trans_id?: string;
  merchant_prepare_id?: string;
  amount?: string;
  action?: string;
  error?: string;
  error_note?: string;
  sign_time?: string;
  sign_string?: string;
}

export interface ClickResponse {
  click_trans_id: string;
  merchant_trans_id: string;
  merchant_prepare_id?: number;
  merchant_confirm_id?: number;
  error: number;
  error_note: string;
}

interface Deps {
  repository: PaymentsRepository;
  payments: PaymentsService;
  logger: Logger;
  settings: { serviceId: string; secretKey: string };
}

export class ClickShopApi {
  constructor(private readonly deps: Deps) {}

  async handle(body: ClickRequest): Promise<ClickResponse> {
    const base = {
      click_trans_id: body.click_trans_id ?? '',
      merchant_trans_id: body.merchant_trans_id ?? '',
    };
    const fail = (error: number, note: string): ClickResponse => ({
      ...base,
      error,
      error_note: note,
    });

    if (!this.signed(body)) return fail(CLICK_ERROR.SIGN_CHECK_FAILED, 'SIGN CHECK FAILED');
    if (body.service_id !== this.deps.settings.serviceId) {
      return fail(CLICK_ERROR.BAD_REQUEST, 'Unknown service');
    }

    const action = Number(body.action);
    const subject = body.merchant_trans_id ?? '';
    const payable = await this.deps.payments.resolvePayable(subject).catch(() => null);
    if (payable === null) return fail(CLICK_ERROR.USER_NOT_FOUND, 'Order not found');
    if (payable.paid) {
      return fail(CLICK_ERROR.ALREADY_PAID, 'Already paid');
    }
    if (payable.closed) {
      return fail(CLICK_ERROR.TRANSACTION_CANCELLED, 'Order is closed');
    }
    // Click sends soum with two decimals; totals are stored in tiyin.
    if (Math.round(Number(body.amount) * 100) !== payable.amount.amount) {
      return fail(CLICK_ERROR.INCORRECT_AMOUNT, 'Incorrect parameter amount');
    }

    try {
      if (action === ACTION.PREPARE) return await this.prepare(body, base, payable);
      if (action === ACTION.COMPLETE) return await this.complete(body, base, payable);
    } catch (error) {
      this.deps.logger.error({ err: error, action }, 'click callback failed');
      return fail(CLICK_ERROR.FAILED_TO_UPDATE, 'Failed to update');
    }
    return fail(CLICK_ERROR.ACTION_NOT_FOUND, 'Action not found');
  }

  private async prepare(
    body: ClickRequest,
    base: { click_trans_id: string; merchant_trans_id: string },
    payable: Payable,
  ): Promise<ClickResponse> {
    const existing = (await this.deps.repository.findBySubject(payable.subject)).find(
      (payment) =>
        payment.provider === 'click' &&
        (payment.status === PAYMENT_STATUS.PENDING || payment.status === PAYMENT_STATUS.AUTHORIZED),
    );
    const payment =
      existing ??
      (await this.deps.repository.create({
        orderId: payable.orderId,
        purpose: payable.purpose,
        subject: payable.subject,
        customerId: payable.customerId,
        method: PAYMENT_METHOD.ONLINE,
        provider: 'click',
        amount: payable.amount.amount,
        currency: payable.amount.currency,
      }));

    // Click wants an integer prepare id back and repeats it on Complete.
    const prepareId = Date.now();
    await this.deps.repository.recordTransaction({
      paymentId: payment.id,
      type: 'CHARGE',
      status: PAYMENT_STATUS.AUTHORIZED,
      amount: payable.amount.amount,
      currency: payable.amount.currency,
      externalId: base.click_trans_id,
      idempotencyKey: `click:${base.click_trans_id}:prepare`,
      raw: { prepareId, body },
    });
    await this.deps.repository.updateStatus(payment.id, PAYMENT_STATUS.AUTHORIZED, {
      externalId: base.click_trans_id,
    });

    return {
      ...base,
      merchant_prepare_id: prepareId,
      error: CLICK_ERROR.SUCCESS,
      error_note: 'Success',
    };
  }

  private async complete(
    body: ClickRequest,
    base: { click_trans_id: string; merchant_trans_id: string },
    payable: Payable,
  ): Promise<ClickResponse> {
    const payment = await this.deps.repository.findByExternalId(base.click_trans_id);
    if (payment === null || payment.subject !== payable.subject) {
      return {
        ...base,
        error: CLICK_ERROR.TRANSACTION_NOT_FOUND,
        error_note: 'Transaction not found',
      };
    }
    const prepareId = await this.prepareIdOf(payment.id);
    if (prepareId === null || String(prepareId) !== body.merchant_prepare_id) {
      return {
        ...base,
        error: CLICK_ERROR.TRANSACTION_NOT_FOUND,
        error_note: 'Prepare id mismatch',
      };
    }

    // Click reports its own failure (customer backed out, card declined).
    if (Number(body.error) < 0) {
      if (payment.status !== PAYMENT_STATUS.CANCELLED) {
        await this.deps.repository.updateStatus(payment.id, PAYMENT_STATUS.CANCELLED, {
          failureReason: body.error_note ?? `click error ${body.error}`,
        });
      }
      return {
        ...base,
        error: CLICK_ERROR.TRANSACTION_CANCELLED,
        error_note: 'Transaction cancelled',
      };
    }

    if (payment.status === PAYMENT_STATUS.CANCELLED) {
      return {
        ...base,
        error: CLICK_ERROR.TRANSACTION_CANCELLED,
        error_note: 'Transaction cancelled',
      };
    }
    if (payment.status !== PAYMENT_STATUS.CAPTURED) await this.deps.payments.capture(payment.id);

    return {
      ...base,
      merchant_confirm_id: prepareId,
      error: CLICK_ERROR.SUCCESS,
      error_note: 'Success',
    };
  }

  /** md5(click_trans_id + service_id + secret + merchant_trans_id [+ prepare_id] + amount + action + sign_time). */
  private signed(body: ClickRequest): boolean {
    const parts = [
      body.click_trans_id ?? '',
      body.service_id ?? '',
      this.deps.settings.secretKey,
      body.merchant_trans_id ?? '',
      ...(Number(body.action) === ACTION.COMPLETE ? [body.merchant_prepare_id ?? ''] : []),
      body.amount ?? '',
      body.action ?? '',
      body.sign_time ?? '',
    ];
    const expected = createHash('md5').update(parts.join('')).digest('hex');
    const given = (body.sign_string ?? '').toLowerCase();
    return (
      given.length === expected.length &&
      timingSafeEqual(Buffer.from(given, 'utf8'), Buffer.from(expected, 'utf8'))
    );
  }

  private async prepareIdOf(paymentId: string): Promise<number | null> {
    // The checkout link also wrote a CHARGE row; the Prepare one carries the id.
    const rows = await this.deps.repository.transactionsOf(paymentId);
    for (const row of [...rows].reverse()) {
      const raw = row.raw as { prepareId?: number } | null;
      if (row.type === 'CHARGE' && typeof raw?.prepareId === 'number') return raw.prepareId;
    }
    return null;
  }
}
