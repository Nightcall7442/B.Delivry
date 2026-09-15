/**
 * Notification channels: PUSH | SMS | TELEGRAM | EMAIL | IN_APP.
 */
export const NOTIFICATION_CHANNEL = {
  PUSH: 'PUSH',
  SMS: 'SMS',
  TELEGRAM: 'TELEGRAM',
  EMAIL: 'EMAIL',
  IN_APP: 'IN_APP',
} as const;

export type NotificationChannel = (typeof NOTIFICATION_CHANNEL)[keyof typeof NOTIFICATION_CHANNEL];

export const NOTIFICATION_STATUS = {
  QUEUED: 'QUEUED',
  SENT: 'SENT',
  DELIVERED: 'DELIVERED',
  FAILED: 'FAILED',
  READ: 'READ',
} as const;

export type NotificationStatus = (typeof NOTIFICATION_STATUS)[keyof typeof NOTIFICATION_STATUS];

/** Tried in order until one succeeds. SMS costs money, so push goes first. */
export const CHANNEL_FALLBACK_ORDER: readonly NotificationChannel[] = [
  NOTIFICATION_CHANNEL.PUSH,
  NOTIFICATION_CHANNEL.TELEGRAM,
  NOTIFICATION_CHANNEL.SMS,
];
