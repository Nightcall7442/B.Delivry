/**
 * Admin request/response Zod schemas (reuse @bazar/validation where shared).
 */
import { idSchema } from '@bazar/validation';
import { z } from 'zod';

export const updateSettingsSchema = z.object({
  ordersEnabled: z.boolean().optional(),
  autoConfirmOrders: z.boolean().optional(),
  autoAssignCouriers: z.boolean().optional(),
  defaultTariffId: idSchema.nullable().optional(),
  /** Semver the mobile apps compare against to force an update. */
  minAppVersion: z
    .string()
    .regex(/^\d+\.\d+\.\d+$/)
    .nullable()
    .optional(),
  maintenanceMessage: z.string().trim().max(500).nullable().optional(),
});

export type UpdateSettingsBody = z.infer<typeof updateSettingsSchema>;

const hexColour = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'hex colour like #14A899');
export const updateBrandingSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  branding: z.object({
    appName: z.string().trim().min(1).max(40),
    city: z.string().trim().max(60).nullable().default(null),
    logoUrl: z.string().url().max(500).nullable().default(null),
    primary: hexColour.nullable().default(null),
    accent: hexColour.nullable().default(null),
  }),
});
