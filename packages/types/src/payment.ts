/**
 * payment types / DTOs.
 */
import type {
  PaymentMethod,
  PaymentProviderId,
  PaymentStatus,
  PaymentPurpose,
} from '@bazar/constants';
import type { Id, MoneyDto, TenantEntity } from './common.js';

export interface PaymentDto extends TenantEntity {
  /** Null for a Plus month or a tip. */
  orderId: Id | null;
  purpose: PaymentPurpose;
  subject: string;
  customerId: Id;
  method: PaymentMethod;
  provider: PaymentProviderId;
  status: PaymentStatus;
  amount: MoneyDto;
  refundedAmount: MoneyDto;
  /** Provider-side id, used to match incoming webhooks. */
  externalId: string | null;
  /** Where to send the customer to finish a redirect checkout. */
  confirmationUrl: string | null;
  paidAt: string | null;
  failureReason: string | null;
}

export interface PaymentTransactionDto extends TenantEntity {
  paymentId: Id;
  type: 'CHARGE' | 'CAPTURE' | 'REFUND' | 'CANCEL';
  status: PaymentStatus;
  amount: MoneyDto;
  externalId: string | null;
  /** Same key twice must never charge twice. */
  idempotencyKey: string;
  raw: unknown;
}

/** Courier and customer balances are a ledger: the balance is the sum of rows. */
export interface WalletTransactionDto extends TenantEntity {
  userId: Id;
  type: 'ORDER_PAYOUT' | 'CASH_COLLECTED' | 'TOPUP' | 'WITHDRAWAL' | 'ADJUSTMENT' | 'REFUND';
  amount: MoneyDto;
  balanceAfter: MoneyDto;
  orderId: Id | null;
  comment: string | null;
}

export interface CreatePaymentDto {
  /** One of the two: an order, or a subject like "plus:<customerId>:<day>". */
  orderId?: Id;
  subject?: string;
  method: PaymentMethod;
  returnUrl?: string;
}

export interface RefundPaymentDto {
  /** Omit for a full refund. */
  amount?: MoneyDto;
  reason: string;
}

export interface PaymentListQuery {
  orderId?: Id;
  customerId?: Id;
  status?: PaymentStatus;
  method?: PaymentMethod;
  from?: string;
  to?: string;
}
