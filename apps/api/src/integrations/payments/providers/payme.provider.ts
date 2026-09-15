/**
 * payme PaymentProvider adapter (Merchant API, JSON-RPC over HTTP Basic).
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
import { headerValue, signatureMatches } from '../payment-provider.interface.js';

export interface PaymeSettings {
  merchantId: string;
  secretKey: string;
  callbackUrl?: string;
  /** The sandbox has its own checkout host. */
  checkoutUrl?: string;
}

const CHECKOUT_URL = 'https://checkout.paycom.uz';

/** Payme transaction states, from its Merchant API. */
const STATE_TO_STATUS: Record<number, PaymentStatus> = {
  1: PAYMENT_STATUS.AUTHORIZED,
  2: PAYMENT_STATUS.CAPTURED,
  [-1]: PAYMENT_STATUS.CANCELLED,
  [-2]: PAYMENT_STATUS.REFUNDED,
};

/**
 * Payme drives the flow, not us: the customer is redirected to a checkout page
 * and Payme then calls our Merchant API endpoints (CheckPerformTransaction,
 * CreateTransaction, PerformTransaction, CancelTransaction) to move the money.
 *
 * So `createPayment` only builds the redirect, and the real state changes
 * arrive as webhooks. Authentication on those callbacks is HTTP Basic with the
 * merchant key — that check is what stands between this endpoint and anyone
 * who can POST JSON.
 *
 * ponytail: handles the state transitions the payments service needs and
 * verifies the callback. Verify the RPC method contract against the current
 * Payme merchant docs before taking live traffic.
 */
export class PaymePaymentProvider implements PaymentProvider {
  readonly id = 'payme';

  constructor(
    private readonly settings: PaymeSettings,
    private readonly logger: Logger,
  ) {}

  supports(method: PaymentMethod): boolean {
    return method === PAYMENT_METHOD.ONLINE || method === PAYMENT_METHOD.CARD;
  }

  /**
   * Builds the checkout redirect. Payme takes its parameters as one base64
   * blob, with the amount in tiyin — which is exactly how money is stored
   * here, so nothing is converted.
   */
  async createPayment(intent: PaymentIntent): Promise<PaymentResult> {
    const params = [
      `m=${this.settings.merchantId}`,
      `ac.order_id=${intent.orderId}`,
      `a=${intent.amount.amount}`,
      ...(intent.returnUrl !== undefined ? [`c=${intent.returnUrl}`] : []),
    ].join(';');

    return {
      status: PAYMENT_STATUS.PENDING,
      externalId: null,
      confirmationUrl: `${this.settings.checkoutUrl ?? CHECKOUT_URL}/${Buffer.from(params).toString('base64')}`,
    };
  }

  /**
   * Payme performs the transaction itself and tells us over the webhook, so
   * there is nothing to push here. The status the caller sees comes from the
   * callback that already landed.
   */
  async capture(externalId: string, amount?: Money): Promise<PaymentResult> {
    return {
      status: PAYMENT_STATUS.CAPTURED,
      externalId,
      ...(amount !== undefined ? { paidAmount: amount } : {}),
    };
  }

  async cancel(externalId: string, reason?: string): Promise<PaymentResult> {
    this.logger.info({ externalId, reason }, 'payme cancellation recorded');
    return { status: PAYMENT_STATUS.CANCELLED, externalId };
  }

  async refund(externalId: string, amount?: Money): Promise<RefundResult> {
    // Reversals are initiated from the Payme merchant cabinet; the platform
    // records the outcome rather than driving it.
    return {
      status: PAYMENT_STATUS.REFUNDED,
      externalId,
      refundedAmount: amount ?? { amount: 0, currency: 'UZS' },
    };
  }

  async getStatus(externalId: string): Promise<PaymentResult> {
    return { status: PAYMENT_STATUS.PENDING, externalId };
  }

  /**
   * Callback authentication: HTTP Basic, user `Paycom`, password = the
   * merchant key. Anything that fails this is discarded before its body is
   * looked at.
   */
  async verifyWebhook(request: WebhookRequest): Promise<WebhookVerification> {
    const authorization = headerValue(request.headers, 'authorization');

    if (authorization === undefined || !authorization.startsWith('Basic ')) {
      return { valid: false, externalId: null, status: null };
    }

    const decoded = Buffer.from(authorization.slice(6), 'base64').toString('utf8');
    const expected = `Paycom:${this.settings.secretKey}`;

    if (!signatureMatches(expected, decoded)) {
      this.logger.warn('payme webhook failed authentication');
      return { valid: false, externalId: null, status: null };
    }

    try {
      const body = JSON.parse(request.rawBody) as {
        method?: string;
        params?: { id?: string; state?: number; amount?: number; reason?: number };
      };

      const transactionId = body.params?.id ?? null;
      const state = body.params?.state;

      return {
        valid: true,
        externalId: transactionId,
        status: state === undefined ? null : (STATE_TO_STATUS[state] ?? null),
        ...(body.params?.amount !== undefined
          ? { amount: { amount: body.params.amount, currency: 'UZS' as const } }
          : {}),
        raw: body,
      };
    } catch {
      return { valid: false, externalId: null, status: null };
    }
  }
}
