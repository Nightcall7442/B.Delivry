/**
 * notification types / DTOs.
 */
import type { NotificationChannel, NotificationStatus } from '@bazar/constants';
import type { Id, TenantEntity } from './common.js';

export interface NotificationDto extends TenantEntity {
  userId: Id;
  channel: NotificationChannel;
  status: NotificationStatus;
  /** Template key, e.g. order.courier_assigned. */
  template: string;
  title: string;
  body: string;
  /** Deep link opened when the notification is tapped. */
  deepLink: string | null;
  orderId: Id | null;
  readAt: string | null;
  sentAt: string | null;
  failureReason: string | null;
}

export interface NotificationListQuery {
  unreadOnly?: boolean;
  channel?: NotificationChannel;
}

export interface RegisterPushTokenDto {
  token: string;
  platform: 'ios' | 'android' | 'web';
  deviceId?: string;
}

/** Per-user opt-outs. Transactional templates ignore these. */
export interface NotificationPreferencesDto {
  push: boolean;
  sms: boolean;
  telegram: boolean;
  email: boolean;
  marketing: boolean;
}
