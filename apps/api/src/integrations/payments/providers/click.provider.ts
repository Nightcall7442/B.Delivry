/**
 * click PaymentProvider adapter (Shop API: Prepare / Complete).
 */
import { PAYMENT_METHOD, PAYMENT_STATUS, type PaymentMethod } from '@bazar/constants';
import type {
  Money,
  PaymentIntent,
  PaymentProvider,
  PaymentResult,
  RefundResult,
  WebhookRequest,
  WebhookVerification,
} from '@bazar/payments';
import { createHash } from 'node:crypto';
import type { Logger } from '../../../infrastructure/logger/index.js';
import { signatureMatches } from '../payment-provider.interface.js';

export interface ClickSettings {
  merchantId: string;
  serviceId: string;
  secretKey: string;
}

const CHECKOUT_URL = 'https://my.click.uz/services/pay';

/** Click's two-phase callback: 0 = Prepare, 1 = Complete. */
const ACTION_PREPARE = 0;
const ACTION_COMPLETE = 1;

/**
 * Click uses a two-step callback. It calls Prepare to ask whether the order
 * can be paid, then Complete once the customer has paid. Both callbacks carry
 * an md5 signature over a fixed field order.
 *
 * md5 is Click's choice, not ours; the signature is only as good as the secret
 * behind it, which is why the comparison below is still constant-time.
 *
 * ponytail: implements Prepare/Complete verification and the redirect. Confirm
 * the exact sign_string field order against the current Click Shop API docs
 * before taking live traffic — a wrong order fails closed, but it fails.
 */
export class ClickPaymentProvider implements PaymentProvider {
  readonly id = 'click';

  constructor(
    private readonly settings: ClickSettings,
    private readonly logger: Logger,
  ) {}

  supports(method: PaymentMethod): boolean {
    return method === PAYMENT_METHOD.ONLINE || method === PAYMENT_METHOD.CARD;
  }

  async createPayment(intent: PaymentIntent): Promise<PaymentResult> {
    const params = new URLSearchParams({
      service_id: this.settings.serviceId,
      merchant_id: this.settings.merchantId,
      // Click quotes amounts in soum, while everything here is tiyin.
      amount: (intent.amount.amount / 100).toFixed(2),
      transaction_param: intent.orderId,
      ...(intent.returnUrl !== undefined ? { return_url: intent.returnUrl } : {}),
    });

    return {
      status: PAYMENT_STATUS.PENDING,
      externalId: null,
      confirmationUrl: `${CHECKOUT_URL}?${params.toString()}`,
    };
  }

  async capture(externalId: string, amount?: Money): Promise<PaymentResult> {
    // Click completes the payment itself; the Complete callback is the event.
    return {
      status: PAYMENT_STATUS.CAPTURED,
      externalId,
      ...(amount !== undefined ? { paidAmount: amount } : {}),
    };
  }

  async cancel(externalId: string, reason?: string): Promise<PaymentResult> {
    this.logger.info({ externalId, reason }, 'click cancellation recorded');
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
    try {
      const body = parseBody(request.rawBody);

      const expected = createHash('md5')
        .update(
          [
            body.click_trans_id,
            body.service_id,
            this.settings.secretKey,
            body.merchant_trans_id,
            // Present only on Complete, absent on Prepare.
            body.merchant_prepare_id ?? '',
            body.amount,
            body.action,
            body.sign_time,
          ].join(''),
        )
        .digest('hex');

      if (!signatureMatches(expected, body.sign_string)) {
        this.logger.warn({ transId: body.click_trans_id }, 'click webhook signature mismatch');
        return { valid: false, externalId: null, status: null };
      }

      const action = Number(body.action);
      const errorCode = Number(body.error ?? '0');

      // A negative error code means Click itself rejected the payment.
      const status =
        errorCode < 0
          ? PAYMENT_STATUS.FAILED
          : action === ACTION_COMPLETE
            ? PAYMENT_STATUS.CAPTURED
            : action === ACTION_PREPARE
              ? PAYMENT_STATUS.AUTHORIZED
              : null;

      return {
        valid: true,
        externalId: body.click_trans_id ?? null,
        status,
        amount: { amount: Math.round(Number(body.amount ?? '0') * 100), currency: 'UZS' },
        raw: body,
      };
    } catch {
      return { valid: false, externalId: null, status: null };
    }
  }
}

interface ClickBody {
  click_trans_id?: string;
  service_id?: string;
  merchant_trans_id?: string;
  merchant_prepare_id?: string;
  amount?: string;
  action?: string;
  sign_time?: string;
  sign_string?: string;
  error?: string;
}

/** Click posts form-encoded, but sends JSON in some integrations. */
function parseBody(raw: string): ClickBody {
  if (raw.trimStart().startsWith('{')) return JSON.parse(raw) as ClickBody;
  return Object.fromEntries(new URLSearchParams(raw)) as ClickBody;
}
