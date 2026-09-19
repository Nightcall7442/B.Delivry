/**
 * Zod schemas: auth.
 */
import { OTP_CODE_REGEX } from '@bazar/constants';
import { z } from 'zod';
import { localeSchema } from './common.schema.js';
import { phoneSchema } from './phone.schema.js';

export const requestOtpSchema = z.object({
  phone: phoneSchema,
  locale: localeSchema.optional(),
  channel: z.enum(['sms', 'telegram']).optional(),
});

/** The code the bot deep link carries: base64url, as issued. */
export const telegramLoginCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]{8,64}$/, 'Invalid code'),
});
export type TelegramLoginCodeInput = z.infer<typeof telegramLoginCodeSchema>;

export const verifyOtpSchema = z.object({
  phone: phoneSchema,
  code: z.string().trim().regex(OTP_CODE_REGEX, 'Invalid code'),
  deviceId: z.string().trim().max(128).optional(),
  deviceName: z.string().trim().max(128).optional(),
  pushToken: z.string().trim().max(512).optional(),
});

/**
 * Staff sign in with a password; customers and couriers use OTP only.
 * Minimum length is the one control that actually matters here, so it is
 * enforced at the edge rather than left to the service.
 */
export const loginSchema = z.object({
  phone: phoneSchema,
  password: z.string().min(8).max(128),
  deviceId: z.string().trim().max(128).optional(),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(20).max(2048),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(8).max(128),
    newPassword: z.string().min(8).max(128),
  })
  .refine((v) => v.currentPassword !== v.newPassword, {
    message: 'New password must differ from the current one',
    path: ['newPassword'],
  });

export type RequestOtpInput = z.infer<typeof requestOtpSchema>;
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
