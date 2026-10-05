/**
 * Payments persistence (Prisma). Tenant-scoped.
 */
import type { PaymentMethod, PaymentPurpose, PaymentStatus } from '@bazar/constants';
import type { Payment, PaymentTransaction, Prisma, WalletTransaction } from '@prisma/client';
import { BaseRepository, type PrismaTransaction } from '../../../common/base/base.repository.js';
import type { PaginatedResult } from '../../../common/pagination/index.js';
import type { PaymentListFilters, WalletEntry } from '../types/index.js';

export class PaymentsRepository extends BaseRepository {
  async create(data: {
    orderId: string | null;
    purpose: PaymentPurpose;
    subject: string;
    customerId: string;
    method: PaymentMethod;
    provider: string;
    amount: number;
    currency: string;
  }): Promise<Payment> {
    return this.prisma.payment.create({
      data: { ...data, tenantId: this.tenantScope().tenantId },
    });
  }

  async findById(id: string, tx?: PrismaTransaction): Promise<Payment | null> {
    return this.client(tx).payment.findFirst({ where: this.scoped({ id }) });
  }

  /**
   * Webhooks arrive with the provider's id, not ours. Another provider's transaction can carry the
   * same string and another tenant's payment the same id, so the lookup is bound to both: the
   * tenant of the callback and the provider that is calling.
   */
  async findByExternalId(externalId: string, provider?: string): Promise<Payment | null> {
    return this.prisma.payment.findFirst({
      where: this.scoped({ externalId, ...(provider !== undefined ? { provider } : {}) }),
    });
  }

  /** Every charge for one subject: an order id, or a "plus:…" / "tip:…" key. */
  async findBySubject(subject: string): Promise<Payment[]> {
    return this.prisma.payment.findMany({
      where: this.scoped({ subject }),
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Wallets are keyed by user; a payment names the customer. */
  async customerUserId(customerId: string): Promise<string | null> {
    const row = await this.prisma.customer.findFirst({
      where: this.scoped({ id: customerId }),
      select: { userId: true },
    });
    return row?.userId ?? null;
  }

  async list(filters: PaymentListFilters): Promise<PaginatedResult<Payment>> {
    const where: Prisma.PaymentWhereInput = {
      ...this.tenantScope(),
      ...(filters.orderId !== undefined ? { orderId: filters.orderId } : {}),
      ...(filters.customerId !== undefined ? { customerId: filters.customerId } : {}),
      ...(filters.status !== undefined ? { status: filters.status } : {}),
      ...(filters.method !== undefined ? { method: filters.method } : {}),
      ...(filters.from !== undefined || filters.to !== undefined
        ? {
            createdAt: {
              ...(filters.from !== undefined ? { gte: filters.from } : {}),
              ...(filters.to !== undefined ? { lte: filters.to } : {}),
            },
          }
        : {}),
    };

    return this.page(
      filters,
      (page) => this.prisma.payment.findMany({ where, orderBy: { createdAt: 'desc' }, ...page }),
      () => this.prisma.payment.count({ where }),
    );
  }

  async updateStatus(
    id: string,
    status: PaymentStatus,
    extra: Prisma.PaymentUpdateInput = {},
    tx?: PrismaTransaction,
  ): Promise<Payment> {
    // The tenant rides along even though every caller looked the row up scoped first: a write by id
    // alone is one forgotten lookup away from touching another tenant's money.
    return this.client(tx).payment.update({
      where: { id, ...this.tenantScope() },
      data: { status, ...extra },
    });
  }

  /**
   * Records an attempt against the provider. The unique idempotencyKey is what
   * makes a retried job a no-op instead of a second charge, so a duplicate is
   * swallowed rather than raised.
   */
  async recordTransaction(data: {
    paymentId: string;
    type: 'CHARGE' | 'CAPTURE' | 'REFUND' | 'CANCEL';
    status: PaymentStatus;
    amount: number;
    currency: string;
    externalId: string | null;
    idempotencyKey: string;
    raw?: unknown;
  }): Promise<boolean> {
    try {
      await this.prisma.paymentTransaction.create({
        data: {
          paymentId: data.paymentId,
          type: data.type,
          status: data.status,
          amount: data.amount,
          currency: data.currency,
          externalId: data.externalId,
          idempotencyKey: data.idempotencyKey,
          ...(data.raw !== undefined && data.raw !== null
            ? { raw: data.raw as Prisma.InputJsonValue }
            : {}),
        },
      });
      return true;
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        (error as { code?: string }).code === 'P2002'
      ) {
        return false;
      }
      throw error;
    }
  }

  /** Oldest first: the CHARGE row is what the provider callbacks key on. */
  async transactionsOf(paymentId: string): Promise<PaymentTransaction[]> {
    return this.prisma.paymentTransaction.findMany({
      where: { paymentId },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Claims part of the refundable amount before any money moves. The check and the increment are
   * one statement, so two refunds racing for the same payment cannot both get the last of it.
   */
  async reserveRefund(id: string, amount: number, total: number): Promise<boolean> {
    const result = await this.prisma.payment.updateMany({
      where: {
        ...this.scoped({ id }),
        status: { in: ['CAPTURED', 'PARTIALLY_REFUNDED'] },
        refundedAmount: { lte: total - amount },
      },
      data: { refundedAmount: { increment: amount } },
    });
    return result.count === 1;
  }

  /**
   * Compare-and-set on what was already returned: the claim holds only if nobody returned anything
   * since `seen` was read. Two handlers that both read the same row and both decided «20 000 back»
   * cannot both pay it — the second finds the amount moved and claims nothing.
   */
  async claimRefundFrom(id: string, seen: number, amount: number): Promise<boolean> {
    const result = await this.prisma.payment.updateMany({
      where: {
        ...this.scoped({ id }),
        status: { in: ['CAPTURED', 'PARTIALLY_REFUNDED'] },
        refundedAmount: seen,
      },
      data: { refundedAmount: { increment: amount } },
    });
    return result.count === 1;
  }

  /** The provider or the wallet refused after the amount was claimed: give it back. */
  async releaseRefund(id: string, amount: number): Promise<void> {
    await this.prisma.payment.updateMany({
      where: this.scoped({ id }),
      data: { refundedAmount: { decrement: amount } },
    });
  }

  /**
   * Appends to the wallet ledger and stores the running balance. Serializable
   * at the call site: the balance is read and written, and two concurrent
   * payouts must not both start from the same number.
   */
  async appendWalletEntry(entry: WalletEntry, tx: PrismaTransaction): Promise<WalletTransaction> {
    const current = await tx.walletTransaction.findFirst({
      where: { userId: entry.userId },
      orderBy: { createdAt: 'desc' },
      select: { balanceAfter: true },
    });

    const balanceAfter = (current?.balanceAfter ?? 0) + entry.amount.amount;

    return tx.walletTransaction.create({
      data: {
        tenantId: this.tenantScope().tenantId,
        userId: entry.userId,
        type: entry.type,
        amount: entry.amount.amount,
        currency: entry.amount.currency,
        balanceAfter,
        orderId: entry.orderId ?? null,
        comment: entry.comment ?? null,
      },
    });
  }

  /**
   * Cashback rows past their life that have not been expired yet: an
   * "expired:<id>" debit is what marks one done, so the sweep is idempotent.
   */
  async unexpiredCashback(before: Date, take = 500): Promise<WalletTransaction[]> {
    const rows = await this.prisma.walletTransaction.findMany({
      where: this.scoped({ type: 'CASHBACK' as const, createdAt: { lt: before } }),
      orderBy: { createdAt: 'asc' },
      take,
    });
    if (rows.length === 0) return [];
    const done = await this.prisma.walletTransaction.findMany({
      where: this.scoped({ comment: { in: rows.map((row) => `expired:${row.id}`) } }),
      select: { comment: true },
    });
    const marked = new Set(done.map((row) => row.comment));
    return rows.filter((row) => !marked.has(`expired:${row.id}`));
  }

  async walletBalance(userId: string): Promise<number> {
    const last = await this.prisma.walletTransaction.findFirst({
      where: this.scoped({ userId }),
      orderBy: { createdAt: 'desc' },
      select: { balanceAfter: true },
    });
    return last?.balanceAfter ?? 0;
  }

  async walletHistory(userId: string, filters: { page?: number; pageSize?: number }) {
    const where = this.scoped({ userId });
    return this.page(
      filters,
      (page) =>
        this.prisma.walletTransaction.findMany({ where, orderBy: { createdAt: 'desc' }, ...page }),
      () => this.prisma.walletTransaction.count({ where }),
    );
  }
}
