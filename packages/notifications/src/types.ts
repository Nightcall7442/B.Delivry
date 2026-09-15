/**
 * NotificationMessage, Recipient, Channel, TemplateKey, DeliveryReport.
 */
import type { Locale, NotificationChannel, NotificationStatus } from '@bazar/constants';
import type { TemplateKey } from './templates.js';

export interface Recipient {
  userId: string;
  locale: Locale;
  phone?: string;
  email?: string;
  telegramChatId?: string;
  /** Device push tokens; a user may be signed in on several devices. */
  pushTokens?: string[];
}

export interface NotificationMessage {
  template: TemplateKey;
  recipient: Recipient;
  /** Values interpolated into the localized template (order number, ETA, sum). */
  params: Record<string, string | number>;
  /** Explicit channel, or let the service walk CHANNEL_FALLBACK_ORDER. */
  channel?: NotificationChannel;
  /** Deep link opened when the notification is tapped. */
  deepLink?: string;
  /** Picture shown with the push where the platform allows it. */
  imageUrl?: string;
  /** Same key twice = one notification. Guards against double sends on retry. */
  idempotencyKey?: string;
}

export interface RenderedMessage {
  title: string;
  body: string;
}

export interface DeliveryReport {
  channel: NotificationChannel;
  status: NotificationStatus;
  externalId?: string;
  failureReason?: string;
  sentAt: Date;
}
