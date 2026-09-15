/**
 * Payment events: PaymentAuthorized, PaymentCaptured, PaymentFailed, Refunded.
 */
import type { PaymentMethod, PaymentPurpose } from '@bazar/constants';

export const PAYMENT_EVENT = {
  CREATED: 'payment.created',
  AUTHORIZED: 'payment.authorized',
  CAPTURED: 'payment.captured',
  FAILED: 'payment.failed',
  CANCELLED: 'payment.cancelled',
  REFUNDED: 'payment.refunded',
} as const;

export type PaymentEventName = (typeof PAYMENT_EVENT)[keyof typeof PAYMENT_EVENT];

interface PaymentRef {
  paymentId: string;
  /** Null for a Plus month or a tip. */
  orderId: string | null;
  purpose: PaymentPurpose;
  subject: string;
  customerId: string;
  amount: number;
  currency: string;
  method: PaymentMethod;
  provider: string;
}

export interface PaymentEventPayloads {
  'payment.created': PaymentRef;
  'payment.authorized': PaymentRef & { externalId: string | null };
  /** Money is actually ours. The order may now be treated as paid. */
  'payment.captured': PaymentRef & { externalId: string | null; capturedAt: string };
  'payment.failed': PaymentRef & { reason: string };
  'payment.cancelled': PaymentRef & { reason: string };
  'payment.refunded': PaymentRef & { refundedAmount: number; reason: string; full: boolean };
}
