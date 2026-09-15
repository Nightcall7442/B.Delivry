/**
 * uzum PaymentProvider adapter (Uzum Bank checkout).
 */
import {
  PAYMENT_METHOD,
  PAYMENT_STATUS,
  type PaymentMethod,
  type PaymentStatus,
} from '@bazar/constants';
import type {
  Money,
  PaymentIntent,
  PaymentProvider,
  PaymentResult,
  RefundResult,
  WebhookRequest,
  WebhookVerification,
} from '@bazar/payments';
import type { Logger } from '../../../infrastructure/logger/index.js';
import { headerValue, hmacHex, signatureMatches } from '../payment-provider.interface.js';

export interface UzumSettings {
  merchantId: string;
  secretKey: string;
}

const STATUS_MAP: Record<string, PaymentStatus> = {
  CREATED: PAYMENT_STATUS.PENDING,
  AUTHORIZED: PAYMENT_STATUS.AUTHORIZED,
  CONFIRMED: PAYMENT_STATUS.CAPTURED,
  COMPLETED: PAYMENT_STATUS.CAPTURED,
  REVERSED: PAYMENT_STATUS.CANCELLED,
  REFUNDED: PAYMENT_STATUS.REFUNDED,
  FAILED: PAYMENT_STATUS.FAILED,
};

/**
 * Uzum is a hosted checkout with HMAC-signed callbacks, which is the friendlier
 * of the local integrations: one signature scheme, one status vocabulary.
 *
 * ponytail: the callback verification and status mapping are here; the exact
 * signature payload shape should be confirmed against current Uzum merchant
 * docs before live traffic.
 */
export class UzumPaymentProvider implements PaymentProvider {
  readonly id = 'uzum';

  constructor(
    private readonly settings: UzumSettings,
    private readonly logger: Logger,
  ) {}

  supports(method: PaymentMethod): boolean {
    return method === PAYMENT_METHOD.ONLINE || method === PAYMENT_METHOD.CARD;
  }

  async createPayment(intent: PaymentIntent): Promise<PaymentResult> {
    const params = new URLSearchParams({
      merchantId: this.settings.merchantId,
      orderId: intent.orderId,
      amount: String(intent.amount.amount),
      ...(intent.returnUrl !== undefined ? { redirectUrl: intent.returnUrl } : {}),
    });

    return {
      status: PAYMENT_STATUS.PENDING,
      externalId: null,
      confirmationUrl: `https://checkout.uzumbank.uz/pay?${params.toString()}`,
    };
  }

  async capture(externalId: string, amount?: Money): Promise<PaymentResult> {
    return {
      status: PAYMENT_STATUS.CAPTURED,
      externalId,
      ...(amount !== undefined ? { paidAmount: amount } : {}),
    };
  }

  async cancel(externalId: string, reason?: string): Promise<PaymentResult> {
    this.logger.info({ externalId, reason }, 'uzum cancellation recorded');
    return { status: PAYMENT_STATUS.CANCELLED, externalId };
  }

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

  async verifyWebhook(request: WebhookRequest): Promise<WebhookVerification> {
    const provided = headerValue(request.headers, 'x-signature');
    // Signed over the exact bytes received, which is why the raw body is kept.
    const expected = hmacHex(this.settings.secretKey, request.rawBody);

    if (!signatureMatches(expected, provided)) {
      this.logger.warn('uzum webhook signature mismatch');
      return { valid: false, externalId: null, status: null };
    }

    try {
      const body = JSON.parse(request.rawBody) as {
        transactionId?: string;
        status?: string;
        amount?: number;
      };

      return {
        valid: true,
        externalId: body.transactionId ?? null,
        status: body.status === undefined ? null : (STATUS_MAP[body.status] ?? null),
        ...(body.amount !== undefined
          ? { amount: { amount: body.amount, currency: 'UZS' as const } }
          : {}),
        raw: body,
      };
    } catch {
      return { valid: false, externalId: null, status: null };
    }
  }
}
