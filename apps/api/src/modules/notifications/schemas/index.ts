/**
 * Notifications request/response Zod schemas (reuse @bazar/validation where shared).
 */
import { NOTIFICATION_CHANNEL } from '@bazar/constants';
import { cursorPaginationSchema, idSchema } from '@bazar/validation';
import { z } from 'zod';

export const notificationListQuerySchema = cursorPaginationSchema.extend({
  unreadOnly: z.coerce.boolean().optional(),
  channel: z.nativeEnum(NOTIFICATION_CHANNEL).optional(),
});

export const markReadSchema = z.object({
  ids: z.array(idSchema).min(1).max(200),
});

export const preferencesSchema = z.object({
  push: z.boolean().optional(),
  sms: z.boolean().optional(),
  telegram: z.boolean().optional(),
  email: z.boolean().optional(),
  marketing: z.boolean().optional(),
});

export const pushTokenSchema = z.object({
  token: z.string().trim().min(10).max(512),
  platform: z.enum(['ios', 'android', 'web']),
  deviceId: z.string().trim().max(128).optional(),
});

export type NotificationListQuery = z.infer<typeof notificationListQuerySchema>;
export type PreferencesInput = z.infer<typeof preferencesSchema>;
export type PushTokenInput = z.infer<typeof pushTokenSchema>;
