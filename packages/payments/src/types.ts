/**
 * Money (amount in minor units + currency), PaymentIntent, PaymentResult, RefundResult.
 */
import type { Currency, PaymentMethod, PaymentStatus } from '@bazar/constants';

/** Amount is ALWAYS an integer in minor units (tiyin). Never a float, never a string. */
export interface Money {
  amount: number;
  currency: Currency;
}

export interface PaymentIntent {
  orderId: string;
  /** Idempotency key: retries of the same charge must not double-charge. */
  idempotencyKey: string;
  amount: Money;
  method: PaymentMethod;
  customerId: string;
  description?: string;
  returnUrl?: string;
  metadata?: Record<string, string>;
}

export interface PaymentResult {
  status: PaymentStatus;
  /** Provider-side id, stored so webhooks can be matched back to a transaction. */
  externalId: string | null;
  /** Where to send the customer to finish a 3-D Secure / provider checkout. */
  confirmationUrl?: string;
  paidAmount?: Money;
  failureReason?: string;
  raw?: unknown;
}

export interface RefundResult {
  status: PaymentStatus;
  externalId: string | null;
  refundedAmount: Money;
  failureReason?: string;
}

export interface WebhookVerification {
  valid: boolean;
  externalId: string | null;
  status: PaymentStatus | null;
  amount?: Money;
  raw?: unknown;
}
