/**
 * Customers request/response Zod schemas (reuse @bazar/validation where shared).
 */
import { idSchema, listQuerySchema, optionalText, positiveMoneySchema } from '@bazar/validation';
import { z } from 'zod';

export const customerIdParamsSchema = z.object({ id: idSchema });

export const customersListQuerySchema = listQuerySchema.extend({
  cityId: idSchema.optional(),
  blocked: z.coerce.boolean().optional(),
  minOrders: z.coerce.number().int().min(0).optional(),
  business: z.enum(['pending', 'approved']).optional(),
});

export const applyBusinessSchema = z.object({
  companyName: z.string().trim().min(2).max(120),
  // Uzbek INN: nine digits.
  companyInn: z
    .string()
    .trim()
    .regex(/^\d{9}$/, 'INN is nine digits'),
});

export const setBusinessSchema = z.object({
  approved: z.boolean(),
  creditDays: z.coerce.number().int().min(0).max(90).default(0),
  // Minor units (tiyin).
  creditLimit: z.coerce.number().int().min(0).default(0),
});

export const updateCustomerSchema = z.object({
  firstName: optionalText(64),
  lastName: optionalText(64),
  email: z.string().trim().email().max(200).nullable().optional(),
  defaultAddressId: idSchema.nullable().optional(),
  marketingOptIn: z.boolean().optional(),
});

export const creditSchema = z.object({
  amount: positiveMoneySchema,
  reason: z.string().trim().min(3).max(500),
});

export type CustomersListQuery = z.infer<typeof customersListQuerySchema>;
