/**
 * Notifications module-internal types & DTOs.
 */
import type { Locale, NotificationChannel } from '@bazar/constants';
import type { TemplateKey } from '@bazar/notifications';

export interface SendRequest {
  tenantId: string;
  userId: string;
  template: TemplateKey;
  params: Record<string, string | number>;
  channel?: NotificationChannel | undefined;
  orderId?: string | undefined;
  deepLink?: string | undefined;
  imageUrl?: string | undefined;
  idempotencyKey?: string | undefined;
}

/**
 * Sending to someone who has no account yet: OTP goes to a phone number, not
 * to a user id, because the user may be signing up for the first time.
 */
export interface DirectSendRequest {
  tenantId: string;
  phone: string;
  locale: Locale;
  template: TemplateKey;
  params: Record<string, string | number>;
}

/**
 * The narrow interface other modules depend on. Auth needs `sendDirect` and
 * nothing else; keeping it small stops the auth module from growing a
 * dependency on notification listing, preferences and read receipts.
 */
export interface NotificationSender {
  send(request: SendRequest): Promise<void>;
  sendDirect(request: DirectSendRequest): Promise<void>;
}

export interface NotificationListFilters {
  unreadOnly?: boolean | undefined;
  channel?: NotificationChannel | undefined;
  cursor?: string | undefined;
  limit?: number | undefined;
}

export interface Preferences {
  push: boolean;
  sms: boolean;
  telegram: boolean;
  email: boolean;
  marketing: boolean;
}

/** What a PATCH may carry: any subset, with absent and undefined both meaning "leave it". */
export type PreferencesPatch = {
  [K in keyof Preferences]?: boolean | undefined;
};
