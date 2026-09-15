/**
 * Zod schemas: payment.
 */
import { PAYMENT_METHOD, PAYMENT_STATUS } from '@bazar/constants';
import { z } from 'zod';
import { idSchema, isoDateSchema, positiveMoneySchema } from './common.schema.js';

export const paymentMethodSchema = z.nativeEnum(PAYMENT_METHOD);
export const paymentStatusSchema = z.nativeEnum(PAYMENT_STATUS);

export const createPaymentSchema = z
  .object({
    orderId: idSchema.optional(),
    /** The platform's own products: "plus:<customerId>:<day>", "tip:<orderId>:<minor>", "promo:<storeId>:<day>". */
    subject: z
      .string()
      .regex(/^(plus|tip|promo):[A-Za-z0-9-]+:[A-Za-z0-9-]+$/)
      .max(120)
      .optional(),
    method: paymentMethodSchema,
    /** Where the provider sends the customer back after a redirect checkout. */
    returnUrl: z.string().url().max(1000).optional(),
    /** Which online provider; omitted = the platform default. */
    provider: z.enum(['payme', 'click', 'uzum']).optional(),
  })
  .refine((value) => value.orderId !== undefined || value.subject !== undefined, {
    message: 'orderId or subject is required',
    path: ['orderId'],
  });

export const refundPaymentSchema = z.object({
  /** Omit for a full refund. */
  amount: positiveMoneySchema.optional(),
  reason: z.string().trim().min(3).max(500),
});

export const paymentListQuerySchema = z.object({
  orderId: idSchema.optional(),
  customerId: idSchema.optional(),
  status: paymentStatusSchema.optional(),
  method: paymentMethodSchema.optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
});

export const walletTopupSchema = z.object({
  amount: positiveMoneySchema,
  method: paymentMethodSchema,
});

/**
 * Webhook bodies are provider-shaped and unknown at this layer: the signature
 * check comes first, and only the verified payload is parsed further.
 */
export const webhookParamsSchema = z.object({
  provider: z.enum(['payme', 'click', 'uzum']),
});
