/**
 * PaymentProvider interface: createPayment, capture, cancel, refund, getStatus, verifyWebhook.
 */
import type { PaymentMethod } from '@bazar/constants';
import type {
  Money,
  PaymentIntent,
  PaymentResult,
  RefundResult,
  WebhookVerification,
} from './types.js';

export interface WebhookRequest {
  headers: Record<string, string | string[] | undefined>;
  /** Raw body bytes: signatures are computed over the exact payload, not the parsed JSON. */
  rawBody: string;
}

/**
 * Payme, Click, Uzum, cash and internal balance all sit behind this.
 * Callers pass an idempotency key and may safely retry.
 */
export interface PaymentProvider {
  readonly id: string;
  supports(method: PaymentMethod): boolean;

  /** Starts a charge. May return AUTHORIZED plus a confirmationUrl for redirect flows. */
  createPayment(intent: PaymentIntent): Promise<PaymentResult>;

  /** Takes the authorized money. Cash captures on handover, cards on delivery. */
  capture(externalId: string, amount?: Money): Promise<PaymentResult>;

  cancel(externalId: string, reason?: string): Promise<PaymentResult>;

  /** Omit `amount` for a full refund. */
  refund(externalId: string, amount?: Money, reason?: string): Promise<RefundResult>;

  getStatus(externalId: string): Promise<PaymentResult>;

  /** Verifies the signature before anything is trusted from a callback. */
  verifyWebhook(request: WebhookRequest): Promise<WebhookVerification>;
}
