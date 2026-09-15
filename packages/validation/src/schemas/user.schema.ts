/**
 * Zod schemas: user.
 */
import { ROLE } from '@bazar/constants';
import { z } from 'zod';
import { idSchema, localeSchema, optionalText } from './common.schema.js';
import { phoneSchema } from './phone.schema.js';

export const userStatusSchema = z.enum(['PENDING', 'ACTIVE', 'BLOCKED', 'DELETED']);

export const updateProfileSchema = z.object({
  firstName: optionalText(64),
  lastName: optionalText(64),
  email: z.string().trim().email().max(200).nullable().optional(),
  locale: localeSchema.optional(),
  avatarUrl: z.string().url().max(500).nullable().optional(),
});

export const createUserSchema = z.object({
  phone: phoneSchema,
  firstName: optionalText(64),
  lastName: optionalText(64),
  email: z.string().trim().email().max(200).optional(),
  locale: localeSchema.optional(),
  roles: z.array(z.nativeEnum(ROLE)).min(1),
  /** Staff accounts get a password; OTP-only accounts leave this empty. */
  password: z.string().min(8).max(128).optional(),
});

export const updateUserSchema = createUserSchema.partial().omit({ phone: true }).extend({
  status: userStatusSchema.optional(),
});

export const userListQuerySchema = z.object({
  role: z.nativeEnum(ROLE).optional(),
  status: userStatusSchema.optional(),
});

export const assignRolesSchema = z.object({
  userId: idSchema,
  roles: z.array(z.nativeEnum(ROLE)).min(1),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
