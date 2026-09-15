/**
 * Vendors request/response Zod schemas (reuse @bazar/validation where shared).
 */
import { idSchema, isoDateSchema, listQuerySchema, phoneSchema } from '@bazar/validation';
import { z } from 'zod';

const legalType = z.enum(['INDIVIDUAL_ENTREPRENEUR', 'LLC', 'UNREGISTERED']);
const vendorStatus = z.enum(['PENDING', 'ACTIVE', 'SUSPENDED', 'REJECTED']);

export const vendorIdParamsSchema = z.object({ id: idSchema });

export const vendorsListQuerySchema = listQuerySchema.extend({
  status: vendorStatus.optional(),
  legalType: legalType.optional(),
});

export const registerVendorSchema = z.object({
  userId: idSchema,
  legalType,
  legalName: z.string().trim().min(2).max(200),
  displayName: z.string().trim().min(2).max(120),
  /** STIR: 9 digits in Uzbekistan. */
  taxId: z
    .string()
    .trim()
    .regex(/^\d{9}$/)
    .optional(),
  phone: phoneSchema,
  email: z.string().trim().email().max(200).optional(),
  bankAccount: z.string().trim().max(64).optional(),
});

export const updateVendorSchema = z.object({
  legalName: z.string().trim().min(2).max(200).optional(),
  displayName: z.string().trim().min(2).max(120).optional(),
  phone: phoneSchema.optional(),
  email: z.string().trim().email().max(200).optional(),
  bankAccount: z.string().trim().max(64).optional(),
});

export const setVendorStatusSchema = z.object({ status: vendorStatus });

export const setCommissionSchema = z.object({
  commissionPercent: z.coerce.number().min(0).max(100).nullable(),
});

export const payoutQuerySchema = z.object({ since: isoDateSchema.optional() });

export type VendorsListQuery = z.infer<typeof vendorsListQuerySchema>;
