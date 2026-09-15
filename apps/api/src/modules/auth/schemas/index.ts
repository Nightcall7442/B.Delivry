/**
 * Auth request/response Zod schemas (reuse @bazar/validation where shared).
 */
export {
  requestOtpSchema,
  verifyOtpSchema,
  loginSchema,
  refreshSchema,
  changePasswordSchema,
} from '@bazar/validation';

import { idSchema } from '@bazar/validation';
import { z } from 'zod';

export const sessionParamsSchema = z.object({ sessionId: idSchema });

export const registerPushTokenSchema = z.object({
  token: z.string().trim().min(10).max(512),
  platform: z.enum(['ios', 'android', 'web']),
  deviceId: z.string().trim().max(128).optional(),
});

export type RegisterPushTokenInput = z.infer<typeof registerPushTokenSchema>;
