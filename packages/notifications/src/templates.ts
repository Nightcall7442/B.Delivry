/**
 * Template keys (order.confirmed, courier.assigned, ...) mapped to i18n keys.
 */
import { NOTIFICATION_CHANNEL, type NotificationChannel } from '@bazar/constants';

export const TEMPLATE = {
  AUTH_OTP: 'auth.otp',
  ORDER_CREATED: 'order.created',
  ORDER_CONFIRMED: 'order.confirmed',
  ORDER_COURIER_ASSIGNED: 'order.courier_assigned',
  ORDER_PICKED_UP: 'order.picked_up',
  ORDER_IN_DELIVERY: 'order.in_delivery',
  ORDER_COURIER_ARRIVED: 'order.courier_arrived',
  ORDER_DELIVERED: 'order.delivered',
  ORDER_CANCELLED: 'order.cancelled',
  ORDER_FAILED: 'order.failed',
  /** SMS to the person receiving an order placed for them. */
  ORDER_FOR_RECIPIENT: 'order.for_recipient',
  PAYMENT_CAPTURED: 'payment.captured',
  PAYMENT_FAILED: 'payment.failed',
  PAYMENT_REFUNDED: 'payment.refunded',
  COURIER_NEW_OFFER: 'courier.new_offer',
  COURIER_PAYOUT: 'courier.payout',
  STORE_NEW_ORDER: 'store.new_order',
  SUPPORT_REPLY: 'support.reply',
  PROMO: 'promo.generic',
} as const;

export type TemplateKey = (typeof TEMPLATE)[keyof typeof TEMPLATE];

/** i18n lookup: notifications.<key>.title / .body in the locale bundles. */
export const templateI18nKey = (template: TemplateKey): { title: string; body: string } => ({
  title: `notifications.${template}.title`,
  body: `notifications.${template}.body`,
});

/**
 * Channels allowed per template. OTP never goes to a push token (the device may
 * belong to whoever stole the session), and promos never burn SMS credit.
 */
export const TEMPLATE_CHANNELS: Record<TemplateKey, readonly NotificationChannel[]> = {
  'auth.otp': [NOTIFICATION_CHANNEL.SMS, NOTIFICATION_CHANNEL.TELEGRAM],
  'order.created': [
    NOTIFICATION_CHANNEL.PUSH,
    NOTIFICATION_CHANNEL.TELEGRAM,
    NOTIFICATION_CHANNEL.IN_APP,
  ],
  'order.confirmed': [
    NOTIFICATION_CHANNEL.PUSH,
    NOTIFICATION_CHANNEL.TELEGRAM,
    NOTIFICATION_CHANNEL.IN_APP,
  ],
  'order.courier_assigned': [
    NOTIFICATION_CHANNEL.PUSH,
    NOTIFICATION_CHANNEL.TELEGRAM,
    NOTIFICATION_CHANNEL.IN_APP,
  ],
  'order.picked_up': [
    NOTIFICATION_CHANNEL.PUSH,
    NOTIFICATION_CHANNEL.TELEGRAM,
    NOTIFICATION_CHANNEL.IN_APP,
  ],
  'order.in_delivery': [
    NOTIFICATION_CHANNEL.PUSH,
    NOTIFICATION_CHANNEL.TELEGRAM,
    NOTIFICATION_CHANNEL.IN_APP,
  ],
  'order.courier_arrived': [
    NOTIFICATION_CHANNEL.PUSH,
    NOTIFICATION_CHANNEL.TELEGRAM,
    NOTIFICATION_CHANNEL.SMS,
    NOTIFICATION_CHANNEL.IN_APP,
  ],
  'order.delivered': [
    NOTIFICATION_CHANNEL.PUSH,
    NOTIFICATION_CHANNEL.TELEGRAM,
    NOTIFICATION_CHANNEL.IN_APP,
  ],
  'order.cancelled': [
    NOTIFICATION_CHANNEL.PUSH,
    NOTIFICATION_CHANNEL.TELEGRAM,
    NOTIFICATION_CHANNEL.SMS,
    NOTIFICATION_CHANNEL.IN_APP,
  ],
  'order.failed': [
    NOTIFICATION_CHANNEL.PUSH,
    NOTIFICATION_CHANNEL.TELEGRAM,
    NOTIFICATION_CHANNEL.SMS,
    NOTIFICATION_CHANNEL.IN_APP,
  ],
  'payment.captured': [
    NOTIFICATION_CHANNEL.PUSH,
    NOTIFICATION_CHANNEL.TELEGRAM,
    NOTIFICATION_CHANNEL.IN_APP,
  ],
  'payment.failed': [
    NOTIFICATION_CHANNEL.PUSH,
    NOTIFICATION_CHANNEL.TELEGRAM,
    NOTIFICATION_CHANNEL.IN_APP,
  ],
  'payment.refunded': [
    NOTIFICATION_CHANNEL.PUSH,
    NOTIFICATION_CHANNEL.TELEGRAM,
    NOTIFICATION_CHANNEL.IN_APP,
  ],
  'courier.new_offer': [NOTIFICATION_CHANNEL.PUSH],
  'courier.payout': [NOTIFICATION_CHANNEL.PUSH, NOTIFICATION_CHANNEL.IN_APP],
  'store.new_order': [
    NOTIFICATION_CHANNEL.PUSH,
    NOTIFICATION_CHANNEL.TELEGRAM,
    NOTIFICATION_CHANNEL.IN_APP,
  ],
  'support.reply': [NOTIFICATION_CHANNEL.PUSH, NOTIFICATION_CHANNEL.IN_APP],
  'promo.generic': [NOTIFICATION_CHANNEL.PUSH, NOTIFICATION_CHANNEL.IN_APP],
  'order.for_recipient': [NOTIFICATION_CHANNEL.SMS],
};

/** Transactional templates ignore the user marketing opt-out. */
export const TRANSACTIONAL_TEMPLATES: readonly TemplateKey[] = Object.values(TEMPLATE).filter(
  (key) => key !== TEMPLATE.PROMO,
);
