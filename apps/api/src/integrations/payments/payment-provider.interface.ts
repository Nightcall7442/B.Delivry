/**
 * PaymentProvider contract (re-exports @bazar/payments): createPayment, capture, refund, verifyWebhook, getStatus.
 */
export type {
  PaymentProvider,
  PaymentIntent,
  PaymentResult,
  RefundResult,
  WebhookRequest,
  WebhookVerification,
  Money,
} from '@bazar/payments';

import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Signature comparison for webhooks. Constant-time, because a timing oracle on
 * a signature check is how a forged callback eventually gets accepted.
 */
export function signatureMatches(expected: string, provided: string | undefined): boolean {
  if (provided === undefined) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const hmacHex = (secret: string, payload: string, algorithm = 'sha256'): string =>
  createHmac(algorithm, secret).update(payload).digest('hex');

/** First header value, since Node types a header as string or string[]. */
export function headerValue(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  const value = headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}
