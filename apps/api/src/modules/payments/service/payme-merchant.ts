/**
 * Payme Merchant API — the JSON-RPC endpoint Payme calls while a customer
 * pays on checkout.paycom.uz. Payme drives the transaction: it asks whether
 * the order can be paid, creates its transaction against our order, performs
 * it, and cancels it; we answer with the exact shapes and error codes its
 * spec lists, because anything else is a failed integration check.
 *
 * Our Payment row is the transaction: `externalId` is Payme's id, the status
 * maps onto Payme's `state`, and the transaction rows carry the timestamps.
 */
import { PAYMENT_METHOD, PAYMENT_STATUS } from '@bazar/constants';
import type { Payment, PaymentTransaction } from '@prisma/client';
import type { Logger } from '../../../infrastructure/logger/index.js';
import type { PaymentsRepository } from '../repository/payments.repository.js';
import type { PaymentsService } from './payments.service.js';

/** Payme's transaction states. */
const STATE = { CREATED: 1, PERFORMED: 2, CANCELLED: -1, CANCELLED_AFTER_PERFORM: -2 } as const;

/** Twelve hours: a created transaction Payme never performed is dead. */
const TRANSACTION_TIMEOUT_MS = 12 * 60 * 60 * 1000;

const CANCEL_REASON = { TIMEOUT: 4, REFUND: 5 } as const;

const MESSAGES = {
  auth: { ru: 'Недостаточно привилегий', uz: 'Huquq yetarli emas', en: 'Insufficient privilege' },
  method: { ru: 'Метод не найден', uz: 'Metod topilmadi', en: 'Method not found' },
  request: { ru: 'Неверный запрос', uz: "Noto'g'ri so'rov", en: 'Invalid request' },
  order: { ru: 'Заказ не найден', uz: 'Buyurtma topilmadi', en: 'Order not found' },
  paid: { ru: 'Заказ уже оплачен', uz: "Buyurtma allaqachon to'langan", en: 'Order already paid' },
  closed: {
    ru: 'Заказ отменён или закрыт',
    uz: 'Buyurtma bekor qilingan yoki yopilgan',
    en: 'Order is cancelled or closed',
  },
  amount: { ru: 'Неверная сумма', uz: "Noto'g'ri summa", en: 'Incorrect amount' },
  busy: {
    ru: 'По заказу уже есть активная транзакция',
    uz: 'Buyurtma bo‘yicha faol tranzaksiya mavjud',
    en: 'Another transaction is in progress for this order',
  },
  state: {
    ru: 'Невозможно выполнить операцию',
    uz: 'Amalni bajarib bo‘lmaydi',
    en: 'Cannot perform operation',
  },
  missing: {
    ru: 'Транзакция не найдена',
    uz: 'Tranzaksiya topilmadi',
    en: 'Transaction not found',
  },
  cancel: {
    ru: 'Заказ выполнен, отмена невозможна',
    uz: 'Buyurtma bajarilgan, bekor qilib bo‘lmaydi',
    en: 'Order is complete, cannot cancel',
  },
} as const;

export const PAYME_ERROR = {
  INSUFFICIENT_PRIVILEGE: -32504,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  CANNOT_PERFORM: -31008,
  CANNOT_CANCEL: -31007,
  TRANSACTION_NOT_FOUND: -31003,
  WRONG_AMOUNT: -31001,
  ORDER_NOT_FOUND: -31050,
  ORDER_PAID: -31051,
  ORDER_CLOSED: -31052,
  ORDER_BUSY: -31099,
} as const;

export class PaymeError extends Error {
  constructor(
    readonly code: number,
    readonly text: { ru: string; uz: string; en: string },
    readonly data?: string,
  ) {
    super(text.en);
  }
}

export interface RpcRequest {
  id?: number | string | null;
  method?: string;
  params?: Record<string, unknown>;
}

export type RpcResponse =
  | { jsonrpc: '2.0'; id: number | string | null; result: unknown }
  | {
      jsonrpc: '2.0';
      id: number | string | null;
      error: { code: number; message: { ru: string; uz: string; en: string }; data?: string };
    };

interface Deps {
  repository: PaymentsRepository;
  payments: PaymentsService;
  logger: Logger;
}

export class PaymeMerchantApi {
  constructor(private readonly deps: Deps) {}

  /** One entry point: dispatches by method and wraps the answer in JSON-RPC. */
  async handle(body: RpcRequest): Promise<RpcResponse> {
    const id = body.id ?? null;
    try {
      const result = await this.dispatch(body.method, body.params ?? {});
      return { jsonrpc: '2.0', id, result };
    } catch (error) {
      if (error instanceof PaymeError) {
        return {
          jsonrpc: '2.0',
          id,
          error: {
            code: error.code,
            message: error.text,
            ...(error.data ? { data: error.data } : {}),
          },
        };
      }
      this.deps.logger.error({ err: error, method: body.method }, 'payme rpc failed');
      return {
        jsonrpc: '2.0',
        id,
        error: { code: PAYME_ERROR.INVALID_REQUEST, message: MESSAGES.request },
      };
    }
  }

  private async dispatch(method: string | undefined, params: Record<string, unknown>) {
    switch (method) {
      case 'CheckPerformTransaction':
        return this.checkPerform(params);
      case 'CreateTransaction':
        return this.create(params);
      case 'PerformTransaction':
        return this.perform(params);
      case 'CancelTransaction':
        return this.cancel(params);
      case 'CheckTransaction':
        return this.check(params);
      case 'GetStatement':
        return this.statement(params);
      default:
        throw new PaymeError(PAYME_ERROR.METHOD_NOT_FOUND, MESSAGES.method);
    }
  }

  // ------------------------------------------------------------- methods

  private async checkPerform(params: Record<string, unknown>) {
    await this.payable(params);
    return { allow: true };
  }

  private async create(params: Record<string, unknown>) {
    const transactionId = str(params['id']);
    const time = num(params['time']);
    if (transactionId === null || time === null) {
      throw new PaymeError(PAYME_ERROR.INVALID_REQUEST, MESSAGES.request);
    }

    const existing = await this.deps.repository.findByExternalId(transactionId);
    if (existing !== null) {
      // Payme retries CreateTransaction; the same id must get the same answer.
      if (stateOf(existing) !== STATE.CREATED) {
        throw new PaymeError(PAYME_ERROR.CANNOT_PERFORM, MESSAGES.state);
      }
      if (Date.now() - time > TRANSACTION_TIMEOUT_MS) {
        await this.cancelPayment(existing, CANCEL_REASON.TIMEOUT);
        throw new PaymeError(PAYME_ERROR.CANNOT_PERFORM, MESSAGES.state);
      }
      return {
        create_time: await this.createTime(existing),
        transaction: existing.id,
        state: STATE.CREATED,
      };
    }

    const { payable, amount } = await this.payable(params);

    const live = (await this.deps.repository.findBySubject(payable.subject)).find(
      (payment) =>
        payment.externalId !== null &&
        payment.externalId !== transactionId &&
        stateOf(payment) === STATE.CREATED,
    );
    if (live !== undefined) throw new PaymeError(PAYME_ERROR.ORDER_BUSY, MESSAGES.busy);

    // Reuse the pending row the checkout created, or open one now: a customer
    // who paid straight from a Payme link never called POST /payments.
    const pending =
      (await this.deps.repository.findBySubject(payable.subject)).find(
        (payment) => payment.provider === 'payme' && payment.status === PAYMENT_STATUS.PENDING,
      ) ??
      (await this.deps.repository.create({
        orderId: payable.orderId,
        purpose: payable.purpose,
        subject: payable.subject,
        customerId: payable.customerId,
        method: PAYMENT_METHOD.ONLINE,
        provider: 'payme',
        amount,
        currency: payable.amount.currency,
      }));

    await this.deps.repository.recordTransaction({
      paymentId: pending.id,
      type: 'CHARGE',
      status: PAYMENT_STATUS.AUTHORIZED,
      amount,
      currency: payable.amount.currency,
      externalId: transactionId,
      idempotencyKey: `payme:${transactionId}:create`,
      raw: { time, params },
    });
    const created = await this.deps.repository.updateStatus(pending.id, PAYMENT_STATUS.AUTHORIZED, {
      externalId: transactionId,
    });

    return { create_time: time, transaction: created.id, state: STATE.CREATED };
  }

  private async perform(params: Record<string, unknown>) {
    const payment = await this.transaction(params);
    const state = stateOf(payment);

    if (state === STATE.PERFORMED) {
      return {
        transaction: payment.id,
        perform_time: payment.paidAt?.getTime() ?? 0,
        state: STATE.PERFORMED,
      };
    }
    if (state !== STATE.CREATED) throw new PaymeError(PAYME_ERROR.CANNOT_PERFORM, MESSAGES.state);

    const createdAt = await this.createTime(payment);
    if (Date.now() - createdAt > TRANSACTION_TIMEOUT_MS) {
      await this.cancelPayment(payment, CANCEL_REASON.TIMEOUT);
      throw new PaymeError(PAYME_ERROR.CANNOT_PERFORM, MESSAGES.state);
    }

    const captured = await this.deps.payments.capture(payment.id);
    return {
      transaction: captured.id,
      perform_time: captured.paidAt?.getTime() ?? Date.now(),
      state: STATE.PERFORMED,
    };
  }

  private async cancel(params: Record<string, unknown>) {
    const payment = await this.transaction(params);
    const reason = num(params['reason']) ?? 0;
    const state = stateOf(payment);

    if (state === STATE.CREATED) {
      const cancelled = await this.cancelPayment(payment, reason);
      return {
        transaction: payment.id,
        cancel_time: cancelled.updatedAt.getTime(),
        state: STATE.CANCELLED,
      };
    }
    if (state === STATE.PERFORMED) {
      // Money already moved: only refundable while the goods are not delivered.
      const payable = await this.deps.payments.resolvePayable(payment.subject);
      if (!payable.refundable) {
        throw new PaymeError(PAYME_ERROR.CANNOT_CANCEL, MESSAGES.cancel);
      }
      const refunded = await this.deps.payments.refund(payment.id, {
        reason: `Payme cancel reason ${reason}`,
      });
      return {
        transaction: payment.id,
        cancel_time: refunded.updatedAt.getTime(),
        state: STATE.CANCELLED_AFTER_PERFORM,
      };
    }
    // Already cancelled: same answer as the first time.
    return { transaction: payment.id, cancel_time: payment.updatedAt.getTime(), state };
  }

  private async check(params: Record<string, unknown>) {
    const payment = await this.transaction(params);
    const state = stateOf(payment);
    const cancelled = state === STATE.CANCELLED || state === STATE.CANCELLED_AFTER_PERFORM;
    return {
      create_time: await this.createTime(payment),
      perform_time: payment.paidAt?.getTime() ?? 0,
      cancel_time: cancelled ? payment.updatedAt.getTime() : 0,
      transaction: payment.id,
      state,
      reason: cancelled ? Number(payment.failureReason?.replace(/\D/g, '') || 0) || null : null,
    };
  }

  private async statement(params: Record<string, unknown>) {
    const from = num(params['from']) ?? 0;
    const to = num(params['to']) ?? Date.now();
    const rows = await this.deps.repository.list({
      from: new Date(from),
      to: new Date(to),
      pageSize: 1000,
    });
    const transactions = [];
    for (const payment of rows.items) {
      if (payment.provider !== 'payme' || payment.externalId === null) continue;
      const state = stateOf(payment);
      transactions.push({
        id: payment.externalId,
        time: await this.createTime(payment),
        amount: payment.amount,
        account: { order_id: payment.orderId },
        create_time: await this.createTime(payment),
        perform_time: payment.paidAt?.getTime() ?? 0,
        cancel_time: state < 0 ? payment.updatedAt.getTime() : 0,
        transaction: payment.id,
        state,
        reason: state < 0 ? Number(payment.failureReason?.replace(/\D/g, '') || 0) || null : null,
      });
    }
    return { transactions };
  }

  // ------------------------------------------------------------- helpers

  /** Whatever `account.order_id` names, checked to be payable for `amount`. */
  private async payable(params: Record<string, unknown>) {
    const account = (params['account'] ?? {}) as Record<string, unknown>;
    const subject = str(account['order_id']);
    const amount = num(params['amount']);
    if (subject === null)
      throw new PaymeError(PAYME_ERROR.ORDER_NOT_FOUND, MESSAGES.order, 'order_id');

    const payable = await this.deps.payments.resolvePayable(subject).catch(() => null);
    if (payable === null)
      throw new PaymeError(PAYME_ERROR.ORDER_NOT_FOUND, MESSAGES.order, 'order_id');
    if (payable.paid) {
      throw new PaymeError(PAYME_ERROR.ORDER_PAID, MESSAGES.paid, 'order_id');
    }
    if (payable.closed) {
      throw new PaymeError(PAYME_ERROR.ORDER_CLOSED, MESSAGES.closed, 'order_id');
    }
    // Payme sends tiyin; totals are stored in tiyin. No conversion, no rounding.
    if (amount === null || amount !== payable.amount.amount) {
      throw new PaymeError(PAYME_ERROR.WRONG_AMOUNT, MESSAGES.amount);
    }
    return { payable, amount };
  }

  private async transaction(params: Record<string, unknown>): Promise<Payment> {
    const transactionId = str(params['id']);
    const payment =
      transactionId === null ? null : await this.deps.repository.findByExternalId(transactionId);
    if (payment === null) throw new PaymeError(PAYME_ERROR.TRANSACTION_NOT_FOUND, MESSAGES.missing);
    return payment;
  }

  private async cancelPayment(payment: Payment, reason: number): Promise<Payment> {
    await this.deps.repository.recordTransaction({
      paymentId: payment.id,
      type: 'CANCEL',
      status: PAYMENT_STATUS.CANCELLED,
      amount: payment.amount,
      currency: payment.currency,
      externalId: payment.externalId,
      idempotencyKey: `payme:${payment.externalId}:cancel`,
      raw: { reason },
    });
    return this.deps.repository.updateStatus(payment.id, PAYMENT_STATUS.CANCELLED, {
      failureReason: `payme reason ${reason}`,
    });
  }

  /** Payme's `time` from CreateTransaction, kept on the CHARGE row. */
  private async createTime(payment: Payment): Promise<number> {
    const rows = await this.deps.repository.transactionsOf(payment.id);
    const charge = rows.find((row: PaymentTransaction) => row.type === 'CHARGE');
    const raw = charge?.raw as { time?: number } | null | undefined;
    return raw?.time ?? charge?.createdAt.getTime() ?? payment.createdAt.getTime();
  }
}

/** Our status → Payme state. Partial refunds do not exist in Payme's model. */
function stateOf(payment: Payment): number {
  switch (payment.status) {
    case PAYMENT_STATUS.AUTHORIZED:
      return STATE.CREATED;
    case PAYMENT_STATUS.CAPTURED:
    case PAYMENT_STATUS.PARTIALLY_REFUNDED:
      return STATE.PERFORMED;
    case PAYMENT_STATUS.REFUNDED:
      return STATE.CANCELLED_AFTER_PERFORM;
    case PAYMENT_STATUS.CANCELLED:
    case PAYMENT_STATUS.FAILED:
      return STATE.CANCELLED;
    default:
      return 0;
  }
}

const str = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value : null;
const num = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;
