/**
 * Payments request/response Zod schemas (reuse @bazar/validation where shared).
 */
export {
  createPaymentSchema,
  refundPaymentSchema,
  paymentListQuerySchema,
  walletTopupSchema,
  webhookParamsSchema,
} from '@bazar/validation';

import { idSchema, listQuerySchema, paymentListQuerySchema } from '@bazar/validation';
import { z } from 'zod';

export const paymentIdParamsSchema = z.object({ id: idSchema });

export const paymentsListQuerySchema = listQuerySchema.merge(paymentListQuerySchema);

export const walletHistoryQuerySchema = listQuerySchema.extend({
  userId: idSchema.optional(),
});

export type PaymentsListQuery = z.infer<typeof paymentsListQuerySchema>;
