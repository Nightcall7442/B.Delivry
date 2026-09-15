/**
 * cash PaymentProvider adapter.
 */
import { PAYMENT_METHOD, PAYMENT_STATUS, type PaymentMethod } from '@bazar/constants';
import type {
  Money,
  PaymentIntent,
  PaymentProvider,
  PaymentResult,
  RefundResult,
  WebhookVerification,
} from '@bazar/payments';

/**
 * Cash on delivery, which is still how most bazaar orders are paid.
 *
 * There is no external system: the courier collects notes at the door. This
 * adapter exists so the payments service has one code path for every method,
 * and so a cash order still produces a Payment row that can be reconciled
 * against the courier's balance.
 */
export class CashPaymentProvider implements PaymentProvider {
  readonly id = 'cash';

  supports(method: PaymentMethod): boolean {
    return method === PAYMENT_METHOD.CASH;
  }

  /** Nothing to authorize: the money appears at handover, not before. */
  async createPayment(intent: PaymentIntent): Promise<PaymentResult> {
    return {
      status: PAYMENT_STATUS.PENDING,
      externalId: `cash:${intent.orderId}`,
    };
  }

  /** Called when the courier confirms they were paid. */
  async capture(externalId: string, amount?: Money): Promise<PaymentResult> {
    return {
      status: PAYMENT_STATUS.CAPTURED,
      externalId,
      ...(amount !== undefined ? { paidAmount: amount } : {}),
    };
  }

  async cancel(externalId: string): Promise<PaymentResult> {
    return { status: PAYMENT_STATUS.CANCELLED, externalId };
  }

  /**
   * Cash cannot be sent back down a wire. The payments service turns this into
   * store credit on the customer's wallet instead; the status here only
   * records that the refund was agreed.
   */
  async refund(externalId: string, amount?: Money): Promise<RefundResult> {
    return {
      status: PAYMENT_STATUS.REFUNDED,
      externalId,
      refundedAmount: amount ?? { amount: 0, currency: 'UZS' },
    };
  }

  async getStatus(externalId: string): Promise<PaymentResult> {
    return { status: PAYMENT_STATUS.PENDING, externalId };
  }

  /** No provider, no callbacks. */
  async verifyWebhook(): Promise<WebhookVerification> {
    return { valid: false, externalId: null, status: null };
  }
}
