/**
 * Payments configuration slice.
 */
import type { PaymentProviderId } from '@bazar/constants';
import type { Env } from './env.schema.js';

export interface PaymentsConfig {
  defaultProvider: PaymentProviderId;
  payme?: { merchantId: string; secretKey: string; callbackUrl?: string; checkoutUrl?: string };
  click?: { merchantId: string; serviceId: string; secretKey: string };
  uzum?: { merchantId: string; secretKey: string };
  /** Payment providers are slow and retried by a job; a long timeout is fine. */
  timeoutMs: number;
}

export function buildPaymentsConfig(env: Env): PaymentsConfig {
  return {
    defaultProvider: env.PAYMENTS_DEFAULT_PROVIDER,
    ...(env.PAYME_MERCHANT_ID !== undefined && env.PAYME_SECRET_KEY !== undefined
      ? {
          payme: {
            merchantId: env.PAYME_MERCHANT_ID,
            secretKey: env.PAYME_SECRET_KEY,
            ...(env.PAYME_CALLBACK_URL !== undefined
              ? { callbackUrl: env.PAYME_CALLBACK_URL }
              : {}),
            ...(env.PAYME_CHECKOUT_URL !== undefined
              ? { checkoutUrl: env.PAYME_CHECKOUT_URL }
              : {}),
          },
        }
      : {}),
    ...(env.CLICK_MERCHANT_ID !== undefined &&
    env.CLICK_SERVICE_ID !== undefined &&
    env.CLICK_SECRET_KEY !== undefined
      ? {
          click: {
            merchantId: env.CLICK_MERCHANT_ID,
            serviceId: env.CLICK_SERVICE_ID,
            secretKey: env.CLICK_SECRET_KEY,
          },
        }
      : {}),
    ...(env.UZUM_MERCHANT_ID !== undefined && env.UZUM_SECRET_KEY !== undefined
      ? { uzum: { merchantId: env.UZUM_MERCHANT_ID, secretKey: env.UZUM_SECRET_KEY } }
      : {}),
    timeoutMs: 15_000,
  };
}
