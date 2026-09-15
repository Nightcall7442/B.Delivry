/**
 * Orders request/response Zod schemas (reuse @bazar/validation where shared).
 */
export {
  actualQuantitiesSchema,
  cancelOrderSchema,
  changeOrderStatusSchema,
  createGroupOrderSchema,
  createOrderSchema,
  orderListQuerySchema,
  quoteGroupOrderSchema,
  orderStatusSchema,
  quoteOrderSchema,
} from '@bazar/validation';

import { PAYMENT_METHOD, PAYMENT_STATUS } from '@bazar/constants';
import { idSchema, listQuerySchema, orderStatusSchema } from '@bazar/validation';
import { z } from 'zod';

export const orderIdParamsSchema = z.object({ id: idSchema });

export const orderNumberParamsSchema = z.object({
  number: z.string().trim().min(4).max(32),
});

export const ordersListQuerySchema = listQuerySchema.extend({
  status: z.union([orderStatusSchema, z.array(orderStatusSchema)]).optional(),
  customerId: idSchema.optional(),
  courierId: idSchema.optional(),
  storeId: idSchema.optional(),
  cityId: idSchema.optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  activeOnly: z.coerce.boolean().optional(),
  paymentMethod: z.nativeEnum(PAYMENT_METHOD).optional(),
  paymentStatus: z.nativeEnum(PAYMENT_STATUS).optional(),
});

export const repeatOrderSchema = z.object({
  addressId: idSchema.optional(),
});

/** Courier verbs, so the app does not have to know status names. */
export const courierActionSchema = z.object({
  action: z.enum([
    'arrived_pickup',
    'picking_up',
    'picked_up',
    'in_delivery',
    'arrived',
    'delivered',
  ]),
  comment: z.string().trim().max(500).optional(),
});

export type OrdersListQuery = z.infer<typeof ordersListQuerySchema>;
export type CourierActionInput = z.infer<typeof courierActionSchema>;
