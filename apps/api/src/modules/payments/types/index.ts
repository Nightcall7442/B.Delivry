/**
 * Payments module-internal types & DTOs.
 */
import type { PaymentMethod, PaymentPurpose, PaymentStatus } from '@bazar/constants';
import type { Money } from '@bazar/payments';

export interface CreatePaymentInput {
  /** An order, or a subject like "plus:<customerId>:<period>"; one of the two. */
  orderId?: string | undefined;
  subject?: string | undefined;
  method: PaymentMethod;
  returnUrl?: string | undefined;
  provider?: string | undefined;
}

/** What is being paid for, whichever kind of thing it is. */
export interface Payable {
  subject: string;
  purpose: PaymentPurpose;
  orderId: string | null;
  customerId: string;
  amount: Money;
  description: string;
  /** Already captured: a provider must not charge again. */
  paid: boolean;
  /** Cancelled, delivered, expired: no new charge makes sense. */
  closed: boolean;
  /** Money may still go back through the provider. */
  refundable: boolean;
}

export interface PaymentListFilters {
  orderId?: string | undefined;
  customerId?: string | undefined;
  status?: PaymentStatus | undefined;
  method?: PaymentMethod | undefined;
  from?: Date | undefined;
  to?: Date | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
}

export interface RefundInput {
  amount?: Money | undefined;
  reason: string;
}

export type WalletEntryType =
  | 'ORDER_PAYOUT'
  | 'CASH_COLLECTED'
  | 'PAYMENT'
  | 'CASHBACK'
  | 'TIP'
  | 'REFERRAL'
  | 'TOPUP'
  | 'WITHDRAWAL'
  | 'ADJUSTMENT'
  | 'REFUND';

export interface WalletEntry {
  userId: string;
  type: WalletEntryType;
  amount: Money;
  orderId?: string | null;
  comment?: string | null;
}
