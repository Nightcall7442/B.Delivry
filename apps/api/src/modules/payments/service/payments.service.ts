/**
 * Payments business logic. Payments, transactions, refunds via PaymentProvider abstraction, wallet/balance.
 */
import type { AuthenticatedUser } from '@bazar/auth';
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
  type PaymentStatus,
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
import { runWithContext } from '../../../common/tenant/tenant-context.js';
import { systemContext } from '../../../common/types/request-context.js';
import { ERROR_CODE } from '../../../common/errors/error-codes.js';
import {
  AppError,
  ConflictError,
  ForbiddenError,
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

/** Staff (operators, admins) are told apart by the one unscoped permission: order:read_any. */
const isStaff = (user: AuthenticatedUser): boolean =>
  user.permissions.includes(PERMISSION.ORDER_READ_ANY);

/** The only states a payment can still be captured from; every other one is over, one way or another. */
const CAPTURABLE: readonly PaymentStatus[] = [PAYMENT_STATUS.PENDING, PAYMENT_STATUS.AUTHORIZED];

/**
 * What a provider's word may change, and from where. A callback is evidence of what happened on the
 * provider's side, not an instruction: a replayed or reordered one must never walk a payment
 * backwards (a captured one to authorized, a refunded one to failed). Capture has its own door.
 */
const WEBHOOK_MOVES: Partial<Record<PaymentStatus, readonly PaymentStatus[]>> = {
  [PAYMENT_STATUS.AUTHORIZED]: [PAYMENT_STATUS.PENDING],
  [PAYMENT_STATUS.FAILED]: [PAYMENT_STATUS.PENDING, PAYMENT_STATUS.AUTHORIZED],
  [PAYMENT_STATUS.CANCELLED]: [PAYMENT_STATUS.PENDING, PAYMENT_STATUS.AUTHORIZED],
  [PAYMENT_STATUS.REFUNDED]: [PAYMENT_STATUS.CAPTURED, PAYMENT_STATUS.PARTIALLY_REFUNDED],
};

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
      const store = await this.prisma.store.findFirst({
        where: { id: storeId, tenantId: this.tenantId() },
        select: { tenantId: true, vendorId: true, vendor: { select: { userId: true } } },
      });
      if (store === null) throw new NotFoundError('Store', storeId);
      // A lookup makes profiles for nobody but the vendor who is paying: a provider callback or the
      // desk only finds the one that purchase already created.
      const caller = this.payer();
      const vendorPays =
        caller !== null &&
        caller.vendorId !== undefined &&
        caller.vendorId === store.vendorId &&
        caller.id === store.vendor.userId;
      const customer = vendorPays
        ? await this.prisma.customer.upsert({
            where: { userId: caller.id },
            update: {},
            create: { tenantId: store.tenantId, userId: caller.id },
            select: { id: true },
          })
        : await this.prisma.customer.findUnique({
            where: { userId: store.vendor.userId },
            select: { id: true },
          });
      if (customer === null) throw new NotFoundError('Customer');
      const paid = (await this.repository.findBySubject(subject)).some(
        (payment) => payment.status === PAYMENT_STATUS.CAPTURED,
      );
      return {
        subject,
        purpose: PAYMENT_PURPOSE.PROMO,
        orderId: null,
        customerId: customer.id,
        vendorId: store.vendorId,
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
        // A tip thanks for a delivery: it stays closed until there is one.
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
    this.assertPayer(payable);
    if (payable.purpose === PAYMENT_PURPOSE.TIP && payable.closed) {
      throw new ConflictError('A tip can be left once the order is delivered');
    }
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
    if (input.method === PAYMENT_METHOD.BALANCE) await this.assertOwnWallet(payable.customerId);
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
   *
   * Settling is not something a customer, vendor or courier asks for: the provider callbacks, the
   * jobs and the delivery handler act as the platform, and the desk marks a bank transfer paid.
   */
  async capture(paymentId: string, collectedBy?: string): Promise<Payment> {
    this.assertSettler();
    const payment = await this.getOrThrow(paymentId);

    if (payment.status === PAYMENT_STATUS.CAPTURED) return payment;
    this.assertCapturable(payment);

    const amount = money(payment.amount, payment.currency as Currency);

    if (!NO_PROVIDER_METHODS.includes(payment.method)) {
      // A gateway payment with no transaction on the provider's side was never charged: there is
      // nothing to capture, and the provider's own capture would still answer "captured".
      if (payment.externalId === null) {
        throw new ConflictError('This payment has no provider transaction to capture');
      }
      const provider = this.provider(payment.provider);
      const result = await provider.capture(payment.externalId, amount);

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
    }

    const { payment: captured, settled } = await this.settle(paymentId, collectedBy);
    // Somebody else got there between the read above and the write: their capture is the one that
    // counts, and a second CAPTURED event (or a second cash debt on the courier) is not.
    if (!settled) return captured;

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
   * The flip to CAPTURED, and the courier's cash debt that goes with it, as one serializable unit:
   * the status is read again inside it, so two captures racing for one payment cannot both see
   * "not yet" and both write — one commits, the other retries and finds it done.
   */
  private async settle(
    paymentId: string,
    collectedBy: string | undefined,
  ): Promise<{ payment: Payment; settled: boolean }> {
    return runSerializableWithRetry(this.prisma, async (tx) => {
      const current = await this.repository.findById(paymentId, tx);
      if (current === null) throw new NotFoundError('Payment', paymentId);
      if (current.status === PAYMENT_STATUS.CAPTURED) return { payment: current, settled: false };
      this.assertCapturable(current);

      if (collectedBy !== undefined && NO_PROVIDER_METHODS.includes(current.method)) {
        // Cash the courier is now holding on the platform's behalf.
        await this.repository.appendWalletEntry(
          {
            userId: collectedBy,
            type: 'CASH_COLLECTED',
            amount: money(-current.amount, current.currency as Currency),
            orderId: current.orderId,
            comment: 'Cash collected on delivery',
          },
          tx,
        );
      }

      const payment = await this.repository.updateStatus(
        paymentId,
        PAYMENT_STATUS.CAPTURED,
        { paidAt: new Date() },
        tx,
      );
      return { payment, settled: true };
    });
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

    if (compare(amount, refundable) > 0 || amount.amount <= 0) {
      throw new ConflictError('Refund exceeds the remaining refundable amount');
    }

    // The amount is claimed in one statement before anything moves: two refunds of the same payment
    // (a double click, a retried job) must not each be told "there is still enough left" and each
    // pay it out, to the provider or as store credit.
    if (!(await this.repository.reserveRefund(paymentId, amount.amount, payment.amount))) {
      throw new ConflictError('Refund exceeds the remaining refundable amount');
    }

    // Only a failure before the money moved gives the claim back; once the provider or the ledger
    // has paid, the amount stays spent whatever the bookkeeping after it does.
    const unclaimed = async <T>(step: () => Promise<T>): Promise<T> => {
      try {
        return await step();
      } catch (error) {
        await this.repository.releaseRefund(paymentId, amount.amount);
        throw error;
      }
    };

    if (!NO_PROVIDER_METHODS.includes(payment.method)) {
      const provider = this.provider(payment.provider);
      const record = (result: { status: PaymentStatus; externalId: string | null }) =>
        this.repository.recordTransaction({
          paymentId,
          type: 'REFUND',
          status: result.status,
          amount: amount.amount,
          currency: amount.currency,
          externalId: result.externalId,
          // Keyed on the amount so two different partial refunds both go through.
          idempotencyKey: `payment:${paymentId}:refund:${amount.amount}:${randomUUID()}`,
        });

      const result = await unclaimed(async () => {
        const refunded = await provider.refund(payment.externalId ?? '', amount, input.reason);
        if (refunded.status === PAYMENT_STATUS.FAILED) {
          await record(refunded);
          throw new PaymentFailedError(refunded.failureReason ?? 'Refund failed');
        }
        return refunded;
      });
      await record(result);
    } else {
      // Cash cannot be sent back through a provider, so it becomes store credit.
      await unclaimed(async () => {
        const userId = await this.repository.customerUserId(payment.customerId);
        if (userId === null) throw new NotFoundError('Customer', payment.customerId);
        await this.creditWallet({
          userId,
          type: 'REFUND',
          amount,
          orderId: payment.orderId,
          comment: input.reason,
        });
      });
    }

    const refreshed = await this.getOrThrow(paymentId);
    const remaining = subtract(
      money(refreshed.amount, currency),
      money(refreshed.refundedAmount, currency),
    );

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
   *
   * What a verified callback may do is narrower than what it says: the payment is looked up inside
   * the tenant and among that provider's own, the amount it reports has to be the amount we asked
   * for before it can settle anything, and it can only move a payment forward.
   */
  async handleWebhook(providerId: string, request: WebhookRequest): Promise<void> {
    const provider = this.provider(providerId);
    const verification = await provider.verifyWebhook(request);

    if (!verification.valid) {
      throw new AppError(ERROR_CODE.WEBHOOK_SIGNATURE_INVALID, 401, 'Invalid webhook signature');
    }

    if (verification.externalId === null || verification.status === null) return;
    const { externalId, status, amount } = verification;

    // Past the signature the callback acts as the platform inside its tenant, like the Payme and
    // Click endpoints do; this is the only way an anonymous request ever reaches `capture`.
    const context = this.context();
    await runWithContext(
      systemContext(context.tenantId, `webhook:${providerId}:${externalId}`, context.locale),
      () => this.applyWebhook(providerId, externalId, status, amount),
    );
  }

  private async applyWebhook(
    providerId: string,
    externalId: string,
    status: PaymentStatus,
    reported: Money | undefined,
  ): Promise<void> {
    const payment = await this.repository.findByExternalId(externalId, providerId);
    if (payment === null || payment.provider !== providerId) {
      this.logger.warn({ externalId, providerId }, 'webhook for unknown payment');
      return;
    }

    // Providers resend callbacks; landing on the state we already hold is
    // normal and must not be treated as an error.
    if (payment.status === status) return;

    // Money coming in is only believed at the amount we asked for. A capture that does not state
    // its amount is refused too: "paid" without saying how much is not a confirmation.
    const capturing = status === PAYMENT_STATUS.CAPTURED;
    if (capturing && reported === undefined) {
      this.logger.error({ paymentId: payment.id, providerId }, 'webhook capture without an amount');
      throw new ConflictError('The callback does not state the amount paid');
    }
    if (
      (capturing || status === PAYMENT_STATUS.AUTHORIZED) &&
      reported !== undefined &&
      (reported.amount !== payment.amount || reported.currency !== payment.currency)
    ) {
      this.logger.error(
        { paymentId: payment.id, providerId, expected: payment.amount, reported: reported.amount },
        'webhook amount does not match the payment',
      );
      throw new ConflictError('The callback amount does not match the payment');
    }

    if (capturing) {
      await this.capture(payment.id);
      return;
    }

    if (!(WEBHOOK_MOVES[status] ?? []).includes(payment.status)) {
      this.logger.warn(
        { paymentId: payment.id, from: payment.status, to: status },
        'webhook would move the payment backwards or sideways: ignored',
      );
      return;
    }

    await this.repository.updateStatus(payment.id, status);

    if (status === PAYMENT_STATUS.FAILED) {
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

    // The desk reads what it filters for, a customer only their own. Nobody else has payments to
    // read: a token without a customer profile must not mean "no scope", so it means no access.
    if (isStaff(user)) return this.repository.list(filters);
    if (user.customerId === undefined) throw new ForbiddenError('Payments are read by their payer');
    return this.repository.list({ ...filters, customerId: user.customerId });
  }

  async get(paymentId: string): Promise<Payment> {
    const payment = await this.getOrThrow(paymentId);
    const user = this.context().user;
    // The desk reads any payment of its tenant (the repository already scoped it); there is no
    // payment:read_any for can() to find, so asking it would refuse the desk.
    this.authorize(
      PERMISSION.PAYMENT_READ,
      user !== null && isStaff(user)
        ? undefined
        : { tenantId: payment.tenantId, customerId: payment.customerId },
    );
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

  /** The signed-in user behind this request; null for callbacks and jobs, which act as the platform. */
  private payer(): AuthenticatedUser | null {
    const context = this.context();
    return context.system === true ? null : context.user;
  }

  /**
   * Everything `resolvePayable` can name is reachable from POST /payments, and the order's vendor and
   * courier may read an order — being a party to a thing is not being its payer. The platform itself
   * (callbacks, jobs) and the desk settle for other people; everyone else pays only their own, and
   * a missing id on the token is never the desk's.
   */
  private assertPayer(payable: Payable): void {
    if (this.context().system === true) return;
    const user = this.currentUser();
    if (isStaff(user)) return;
    const own =
      payable.purpose === PAYMENT_PURPOSE.PROMO
        ? payable.vendorId !== undefined && payable.vendorId === user.vendorId
        : user.customerId !== undefined && user.customerId === payable.customerId;
    if (!own) throw new ForbiddenError('Only the payer can pay for this');
  }

  /**
   * Who may settle a payment: the platform (provider callbacks, jobs, the delivery handler) and
   * the desk. Having a payment of one's own does not make it the payer's to mark paid.
   */
  private assertSettler(): void {
    if (this.context().system === true) return;
    if (!isStaff(this.currentUser())) {
      throw new ForbiddenError('Only the desk or a verified provider callback settles a payment');
    }
  }

  /** A cancelled, failed or refunded payment is not brought back to life by a late callback. */
  private assertCapturable(payment: Payment): void {
    if (!CAPTURABLE.includes(payment.status)) {
      throw new ConflictError(`A ${payment.status.toLowerCase()} payment cannot be captured`);
    }
  }

  /** A wallet is spent on its owner's own word: never by a callback, the desk or another account. */
  private async assertOwnWallet(customerId: string): Promise<void> {
    const owner = await this.repository.customerUserId(customerId);
    const caller = this.payer();
    if (caller === null || owner !== caller.id) {
      throw new ForbiddenError('A wallet is paid from by its owner only');
    }
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
