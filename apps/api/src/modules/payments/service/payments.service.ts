/**
 * Payments business logic. Payments, transactions, refunds via PaymentProvider abstraction, wallet/balance.
 */
import {
  CASHBACK,
  OFFLINE_PAYMENT_METHODS,
  PAYMENT_METHOD,
  PAYMENT_PURPOSE,
  PAYMENT_STATUS,
  PERMISSION,
  PLUS,
  PROMOTION,
  isTerminalOrderStatus,
  type Currency,
  type PaymentMethod,
} from '@bazar/constants';
import {
  compare,
  money,
  subtract,
  type Money,
  type PaymentProvider,
  type WebhookRequest,
} from '@bazar/payments';
import type { Payment, PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { BaseService, type ServiceDeps } from '../../../common/base/base.service.js';
import { ERROR_CODE } from '../../../common/errors/error-codes.js';
import {
  AppError,
  ConflictError,
  NotFoundError,
  PaymentFailedError,
} from '../../../common/errors/index.js';
import type { PaginatedResult } from '../../../common/pagination/index.js';
import { runSerializableWithRetry } from '../../../database/transaction.js';
import { createEvent } from '../../../events/event-bus.js';
import { paymentsTotal } from '../../../infrastructure/telemetry/metrics.js';
import type { OrdersService } from '../../orders/service/orders.service.js';
import { PAYMENT_EVENT } from '../domain/payment.events.js';
import type { PaymentsRepository } from '../repository/payments.repository.js';
import type {
  CreatePaymentInput,
  Payable,
  PaymentListFilters,
  RefundInput,
  WalletEntry,
} from '../types/index.js';

export interface PaymentsServiceDeps extends ServiceDeps {
  prisma: PrismaClient;
  repository: PaymentsRepository;
  orders: OrdersService;
  /** One provider per id: cash, payme, click, uzum, balance. */
  providers: Map<string, PaymentProvider>;
  defaultProvider: string;
}

/** Methods settled by people, not a gateway: cash at the door, the ledger, a bank transfer. */
const NO_PROVIDER_METHODS: readonly PaymentMethod[] = [
  PAYMENT_METHOD.CASH,
  PAYMENT_METHOD.BALANCE,
  PAYMENT_METHOD.INVOICE,
];

export class PaymentsService extends BaseService {
  private readonly prisma: PrismaClient;
  private readonly repository: PaymentsRepository;
  private readonly orders: OrdersService;
  private readonly providers: Map<string, PaymentProvider>;
  private readonly defaultProvider: string;

  constructor(deps: PaymentsServiceDeps) {
    super(deps);
    this.prisma = deps.prisma;
    this.repository = deps.repository;
    this.orders = deps.orders;
    this.providers = deps.providers;
    this.defaultProvider = deps.defaultProvider;
  }

  /**
   * What `subject` is and whether it can still be paid: an order (by id), a
   * Plus month ("plus:<customerId>:<period>") or a tip ("tip:<orderId>:<minor>").
   * Provider callbacks and the checkout both come through here, so every
   * amount check has one source.
   */
  async resolvePayable(subject: string): Promise<Payable> {
    const [kind, ...rest] = subject.split(':');
    if (kind === 'plus' && rest.length === 2) {
      const [customerId, period] = rest as [string, string];
      const paid = (await this.repository.findBySubject(subject)).some(
        (payment) => payment.status === PAYMENT_STATUS.CAPTURED,
      );
      return {
        subject,
        purpose: PAYMENT_PURPOSE.PLUS,
        orderId: null,
        customerId,
        amount: money(PLUS.PRICE_MINOR, 'UZS'),
        description: `Bazar Plus ${period}`,
        paid,
        closed: false,
        refundable: true,
      };
    }
    // A vendor buying a week on top of the home list: the payer is the vendor's
    // user, given a customer profile on the spot so the wallet and provider paths work.
    if (kind === 'promo' && rest.length === 2) {
      const [storeId, period] = rest as [string, string];
      const store = await this.prisma.store.findUnique({
        where: { id: storeId },
        select: { tenantId: true, vendor: { select: { userId: true } } },
      });
      if (store === null) throw new NotFoundError('Store', storeId);
      const customer = await this.prisma.customer.upsert({
        where: { userId: store.vendor.userId },
        update: {},
        create: { tenantId: store.tenantId, userId: store.vendor.userId },
        select: { id: true },
      });
      const paid = (await this.repository.findBySubject(subject)).some(
        (payment) => payment.status === PAYMENT_STATUS.CAPTURED,
      );
      return {
        subject,
        purpose: PAYMENT_PURPOSE.PROMO,
        orderId: null,
        customerId: customer.id,
        amount: money(PROMOTION.PRICE_MINOR, 'UZS'),
        description: `Promotion ${period}`,
        paid,
        closed: false,
        refundable: true,
      };
    }
    if (kind === 'tip' && rest.length === 2) {
      const [orderId, minor] = rest as [string, string];
      const order = await this.orders.get(orderId);
      const amount = Number(minor);
      if (!Number.isInteger(amount) || amount <= 0) {
        throw new AppError(ERROR_CODE.VALIDATION, 422, 'Tip amount is not a whole number');
      }
      const paid = (await this.repository.findBySubject(subject)).some(
        (payment) => payment.status === PAYMENT_STATUS.CAPTURED,
      );
      return {
        subject,
        purpose: PAYMENT_PURPOSE.TIP,
        orderId,
        customerId: order.customerId,
        amount: money(amount, order.currency as Currency),
        description: `Tip for order ${order.number}`,
        paid,
        closed: order.status !== 'DELIVERED',
        refundable: true,
      };
    }
    const order = await this.orders.get(subject);
    return {
      subject,
      purpose: PAYMENT_PURPOSE.ORDER,
      orderId: order.id,
      customerId: order.customerId,
      amount: this.orders.totalsOf(order).total,
      description: `Order ${order.number}`,
      paid: order.paymentStatus === PAYMENT_STATUS.CAPTURED,
      closed: isTerminalOrderStatus(order.status),
      refundable: order.status !== 'DELIVERED',
    };
  }

  /**
   * Starts a charge. Cash needs no provider call: the money moves when the
   * courier hands over the goods, so the payment waits in PENDING until
   * delivery captures it. Balance is settled here and now, from the ledger.
   */
  async create(input: CreatePaymentInput): Promise<Payment> {
    const subject = input.subject ?? input.orderId;
    if (subject === undefined) {
      throw new AppError(ERROR_CODE.VALIDATION, 422, 'orderId or subject is required');
    }
    const payable = await this.resolvePayable(subject);
    if (payable.paid) {
      throw new ConflictError('Already paid');
    }

    const existing = await this.repository.findBySubject(subject);
    const live = existing.find(
      (payment) => payment.status !== 'FAILED' && payment.status !== 'CANCELLED',
    );
    // A retried checkout must not create a second charge for the same thing.
    if (live !== undefined) return live;

    const providerId = this.providerIdFor(input.method, input.provider);
    const payment = await this.repository.create({
      orderId: payable.orderId,
      purpose: payable.purpose,
      subject,
      customerId: payable.customerId,
      method: input.method,
      provider: providerId,
      amount: payable.amount.amount,
      currency: payable.amount.currency,
    });

    await this.publish(createEvent(PAYMENT_EVENT.CREATED, this.eventPayload(payment)));

    if (OFFLINE_PAYMENT_METHODS.includes(input.method)) return payment;
    if (input.method === PAYMENT_METHOD.BALANCE) return this.settleFromBalance(payment);

    const provider = this.provider(providerId);
    const result = await provider.createPayment({
      orderId: subject,
      idempotencyKey: `${subject}:charge`,
      amount: payable.amount,
      method: input.method,
      customerId: payable.customerId,
      description: payable.description,
      ...(input.returnUrl !== undefined ? { returnUrl: input.returnUrl } : {}),
    });

    await this.repository.recordTransaction({
      paymentId: payment.id,
      type: 'CHARGE',
      status: result.status,
      amount: payable.amount.amount,
      currency: payable.amount.currency,
      externalId: result.externalId,
      idempotencyKey: `${subject}:charge`,
      raw: result.raw,
    });

    const updated = await this.repository.updateStatus(payment.id, result.status, {
      externalId: result.externalId,
      confirmationUrl: result.confirmationUrl ?? null,
      failureReason: result.failureReason ?? null,
    });

    paymentsTotal.labels(providerId, input.method, result.status).inc();

    if (result.status === PAYMENT_STATUS.FAILED) {
      await this.publish(
        createEvent(PAYMENT_EVENT.FAILED, {
          ...this.eventPayload(updated),
          reason: result.failureReason ?? 'Provider declined the payment',
        }),
      );
      throw new PaymentFailedError(result.failureReason ?? 'Payment failed');
    }

    if (result.status === PAYMENT_STATUS.AUTHORIZED) {
      await this.publish(
        createEvent(PAYMENT_EVENT.AUTHORIZED, {
          ...this.eventPayload(updated),
          externalId: result.externalId,
        }),
      );
    }

    return updated;
  }

  /**
   * Pays from the customer's ledger: one debit row, captured at once. A short
   * balance fails the payment rather than overdrawing — the screen then offers
   * Payme or Click for the same order.
   */
  private async settleFromBalance(payment: Payment): Promise<Payment> {
    const userId = await this.repository.customerUserId(payment.customerId);
    const amount = money(payment.amount, payment.currency as Currency);
    const balance = userId === null ? money(0, amount.currency) : await this.balance(userId);
    if (userId === null || compare(balance, amount) < 0) {
      const failed = await this.repository.updateStatus(payment.id, PAYMENT_STATUS.FAILED, {
        failureReason: 'Insufficient balance',
      });
      await this.publish(
        createEvent(PAYMENT_EVENT.FAILED, {
          ...this.eventPayload(failed),
          reason: 'Insufficient balance',
        }),
      );
      throw new PaymentFailedError('Insufficient balance');
    }
    await this.creditWallet({
      userId,
      type: 'PAYMENT',
      amount: money(-amount.amount, amount.currency),
      orderId: payment.orderId,
      comment: payment.subject,
    });
    await this.repository.recordTransaction({
      paymentId: payment.id,
      type: 'CHARGE',
      status: PAYMENT_STATUS.CAPTURED,
      amount: amount.amount,
      currency: amount.currency,
      externalId: null,
      idempotencyKey: `${payment.subject}:charge`,
      raw: null,
    });
    const captured = await this.repository.updateStatus(payment.id, PAYMENT_STATUS.CAPTURED, {
      paidAt: new Date(),
    });
    paymentsTotal.labels('balance', payment.method, PAYMENT_STATUS.CAPTURED).inc();
    await this.publish(
      createEvent(PAYMENT_EVENT.CAPTURED, {
        ...this.eventPayload(captured),
        externalId: null,
        capturedAt: new Date().toISOString(),
      }),
    );
    return captured;
  }

  /**
   * Takes the money. For cash this is the courier confirming they collected it,
   * which also puts that cash on the courier's balance as a debt to settle.
   */
  async capture(paymentId: string, collectedBy?: string): Promise<Payment> {
    const payment = await this.getOrThrow(paymentId);

    if (payment.status === PAYMENT_STATUS.CAPTURED) return payment;

    const amount = money(payment.amount, payment.currency as Currency);

    if (!NO_PROVIDER_METHODS.includes(payment.method)) {
      const provider = this.provider(payment.provider);
      const result = await provider.capture(payment.externalId ?? '', amount);

      const fresh = await this.repository.recordTransaction({
        paymentId,
        type: 'CAPTURE',
        status: result.status,
        amount: amount.amount,
        currency: amount.currency,
        externalId: result.externalId,
        idempotencyKey: `payment:${paymentId}:capture`,
        raw: result.raw,
      });

      // The transaction row already existed: another worker captured this.
      if (!fresh) return this.getOrThrow(paymentId);

      if (result.status !== PAYMENT_STATUS.CAPTURED) {
        throw new PaymentFailedError(result.failureReason ?? 'Capture failed');
      }
    } else if (collectedBy !== undefined) {
      // Cash the courier is now holding on the platform's behalf.
      await this.creditWallet({
        userId: collectedBy,
        type: 'CASH_COLLECTED',
        amount: money(-amount.amount, amount.currency),
        orderId: payment.orderId,
        comment: 'Cash collected on delivery',
      });
    }

    const captured = await this.repository.updateStatus(paymentId, PAYMENT_STATUS.CAPTURED, {
      paidAt: new Date(),
    });

    paymentsTotal.labels(payment.provider, payment.method, PAYMENT_STATUS.CAPTURED).inc();

    await this.publish(
      createEvent(PAYMENT_EVENT.CAPTURED, {
        ...this.eventPayload(captured),
        externalId: captured.externalId,
        capturedAt: new Date().toISOString(),
      }),
    );

    return captured;
  }

  /**
   * Refunds, in part or in full. Refusing to refund more than was captured is
   * the whole job here: everything else is the provider's problem.
   */
  async refund(paymentId: string, input: RefundInput): Promise<Payment> {
    this.authorize(PERMISSION.PAYMENT_REFUND);
    const payment = await this.getOrThrow(paymentId);

    if (
      payment.status !== PAYMENT_STATUS.CAPTURED &&
      payment.status !== PAYMENT_STATUS.PARTIALLY_REFUNDED
    ) {
      throw new AppError(
        ERROR_CODE.PAYMENT_NOT_REFUNDABLE,
        409,
        'Only a captured payment can be refunded',
      );
    }

    const currency = payment.currency as Currency;
    const refundable = subtract(
      money(payment.amount, currency),
      money(payment.refundedAmount, currency),
    );
    const amount = input.amount ?? refundable;

    if (compare(amount, refundable) > 0) {
      throw new ConflictError('Refund exceeds the remaining refundable amount');
    }

    if (!NO_PROVIDER_METHODS.includes(payment.method)) {
      const provider = this.provider(payment.provider);
      const result = await provider.refund(payment.externalId ?? '', amount, input.reason);

      await this.repository.recordTransaction({
        paymentId,
        type: 'REFUND',
        status: result.status,
        amount: amount.amount,
        currency: amount.currency,
        externalId: result.externalId,
        // Keyed on the amount so two different partial refunds both go through.
        idempotencyKey: `payment:${paymentId}:refund:${amount.amount}:${randomUUID()}`,
      });

      if (result.status === PAYMENT_STATUS.FAILED) {
        throw new PaymentFailedError(result.failureReason ?? 'Refund failed');
      }
    } else {
      // Cash cannot be sent back through a provider, so it becomes store credit.
      const userId = await this.repository.customerUserId(payment.customerId);
      if (userId === null) throw new NotFoundError('Customer', payment.customerId);
      await this.creditWallet({
        userId,
        type: 'REFUND',
        amount,
        orderId: payment.orderId,
        comment: input.reason,
      });
    }

    await this.repository.addRefunded(paymentId, amount.amount);
    const remaining = subtract(refundable, amount);

    const updated = await this.repository.updateStatus(
      paymentId,
      remaining.amount === 0 ? PAYMENT_STATUS.REFUNDED : PAYMENT_STATUS.PARTIALLY_REFUNDED,
    );

    await this.publish(
      createEvent(PAYMENT_EVENT.REFUNDED, {
        ...this.eventPayload(updated),
        refundedAmount: amount.amount,
        reason: input.reason,
        full: remaining.amount === 0,
      }),
    );

    return updated;
  }

  /**
   * Handles a provider callback. The signature is checked before anything in
   * the payload is believed: a webhook endpoint is public by necessity.
   */
  async handleWebhook(providerId: string, request: WebhookRequest): Promise<void> {
    const provider = this.provider(providerId);
    const verification = await provider.verifyWebhook(request);

    if (!verification.valid) {
      throw new AppError(ERROR_CODE.WEBHOOK_SIGNATURE_INVALID, 401, 'Invalid webhook signature');
    }

    if (verification.externalId === null || verification.status === null) return;

    const payment = await this.repository.findByExternalId(verification.externalId);
    if (payment === null) {
      this.logger.warn({ externalId: verification.externalId }, 'webhook for unknown payment');
      return;
    }

    // Providers resend callbacks; landing on the state we already hold is
    // normal and must not be treated as an error.
    if (payment.status === verification.status) return;

    if (verification.status === PAYMENT_STATUS.CAPTURED) {
      await this.capture(payment.id);
      return;
    }

    await this.repository.updateStatus(payment.id, verification.status);

    if (verification.status === PAYMENT_STATUS.FAILED) {
      await this.publish(
        createEvent(PAYMENT_EVENT.FAILED, {
          ...this.eventPayload(payment),
          reason: 'Provider reported failure',
        }),
      );
    }
  }

  async list(filters: PaymentListFilters): Promise<PaginatedResult<Payment>> {
    const user = this.currentUser();
    this.authorize(PERMISSION.PAYMENT_READ);

    const scoped =
      user.customerId !== undefined && !user.permissions.includes(PERMISSION.ORDER_READ_ANY)
        ? { ...filters, customerId: user.customerId }
        : filters;

    return this.repository.list(scoped);
  }

  async get(paymentId: string): Promise<Payment> {
    const payment = await this.getOrThrow(paymentId);
    this.authorize(PERMISSION.PAYMENT_READ, {
      tenantId: payment.tenantId,
      customerId: payment.customerId,
    });
    return payment;
  }

  // ------------------------------------------------------------------ wallet

  /**
   * The ledger is the balance. Serializable, because the running total is read
   * and written: two concurrent payouts must not both start from the same
   * number and lose one of them.
   */
  async creditWallet(entry: WalletEntry): Promise<void> {
    await runSerializableWithRetry(this.prisma, (tx) =>
      this.repository.appendWalletEntry(entry, tx),
    );
  }

  /**
   * Cashback burns after CASHBACK.EXPIRES_DAYS. ponytail: no FIFO — each
   * expired grant debits min(grant, current balance), which never overdraws
   * and treats spending as "oldest first"; a real ledger with lots is the upgrade.
   */
  async expireCashback(now: Date = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - CASHBACK.EXPIRES_DAYS * 86_400_000);
    const grants = await this.repository.unexpiredCashback(cutoff);
    let expired = 0;
    for (const grant of grants) {
      const balance = await this.repository.walletBalance(grant.userId);
      const burn = Math.min(grant.amount, Math.max(0, balance));
      await this.creditWallet({
        userId: grant.userId,
        type: 'ADJUSTMENT',
        amount: money(-burn, grant.currency as Currency),
        comment: `expired:${grant.id}`,
      });
      expired += burn;
    }
    return expired;
  }

  async balance(userId: string): Promise<Money> {
    const amount = await this.repository.walletBalance(userId);
    return money(amount, 'UZS');
  }

  async walletHistory(userId: string, filters: { page?: number; pageSize?: number }) {
    return this.repository.walletHistory(userId, filters);
  }

  /** Courier earns their share once the trip is done. */
  async payoutCourier(userId: string, amount: Money, orderId: string): Promise<void> {
    await this.creditWallet({ userId, type: 'ORDER_PAYOUT', amount, orderId });
  }

  private providerIdFor(method: PaymentMethod, requested?: string): string {
    if (method === PAYMENT_METHOD.CASH) return 'cash';
    if (method === PAYMENT_METHOD.BALANCE) return 'balance';
    if (method === PAYMENT_METHOD.INVOICE) return 'invoice';
    if (requested !== undefined) return this.provider(requested).id;
    return this.defaultProvider;
  }

  private provider(id: string): PaymentProvider {
    const provider = this.providers.get(id);
    if (provider === undefined) {
      throw new AppError(
        ERROR_CODE.PROVIDER_ERROR,
        503,
        `Payment provider ${id} is not configured`,
      );
    }
    return provider;
  }

  private async getOrThrow(paymentId: string): Promise<Payment> {
    const payment = await this.repository.findById(paymentId);
    if (payment === null) throw new NotFoundError('Payment', paymentId);
    return payment;
  }

  private eventPayload(payment: Payment) {
    return {
      paymentId: payment.id,
      orderId: payment.orderId,
      purpose: payment.purpose,
      subject: payment.subject,
      customerId: payment.customerId,
      amount: payment.amount,
      currency: payment.currency,
      method: payment.method,
      provider: payment.provider,
    };
  }
}
