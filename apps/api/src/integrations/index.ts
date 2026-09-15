/**
 * Integrations barrel: provider factories chosen by config.
 */
import { NOTIFICATION_CHANNEL, type NotificationChannel } from '@bazar/constants';
import type {
  DeliveryReport,
  NotificationMessage,
  NotificationProvider,
  RenderedMessage,
} from '@bazar/notifications';
import type { NotificationsConfig } from '../config/index.js';
import type { Logger } from '../infrastructure/logger/index.js';
import { createEmailProvider } from './email/index.js';
import { createPushProvider } from './push/index.js';
import { createSmsProvider } from './sms/index.js';
import { createTelegramProvider, type TelegramProvider } from './telegram/index.js';

export * from './email/index.js';
export * from './maps/index.js';
export * from './payments/index.js';
export * from './push/index.js';
export * from './sms/index.js';
export * from './storage/index.js';
export * from './telegram/index.js';

/**
 * Adapts the channel-specific clients to the one NotificationProvider shape
 * the notifications service walks through. The service knows about channels
 * and fallback order; it knows nothing about Eskiz or Expo.
 */
export function createNotificationProviders(
  config: NotificationsConfig,
  logger: Logger,
  telegram: TelegramProvider | null = createTelegramProvider(config, logger),
): Map<NotificationChannel, NotificationProvider> {
  const providers = new Map<NotificationChannel, NotificationProvider>();

  const sms = createSmsProvider(config, logger);
  providers.set(NOTIFICATION_CHANNEL.SMS, {
    channel: NOTIFICATION_CHANNEL.SMS,
    // No phone number, nothing to send to.
    supports: (message) => message.recipient.phone !== undefined,
    async send(message, rendered): Promise<DeliveryReport> {
      const phone = message.recipient.phone;
      if (phone === undefined) return failed(NOTIFICATION_CHANNEL.SMS, 'no phone number');

      // One SMS is 70 characters in Cyrillic, so the title is dropped and only
      // the body goes out: every extra segment is another charge.
      const result = await sms.send(phone, rendered.body);
      return {
        channel: NOTIFICATION_CHANNEL.SMS,
        status: result.accepted ? 'SENT' : 'FAILED',
        ...(result.externalId !== null ? { externalId: result.externalId } : {}),
        ...(result.failureReason !== undefined ? { failureReason: result.failureReason } : {}),
        sentAt: new Date(),
      };
    },
  });

  const push = createPushProvider(config, logger);
  providers.set(NOTIFICATION_CHANNEL.PUSH, {
    channel: NOTIFICATION_CHANNEL.PUSH,
    supports: (message) => (message.recipient.pushTokens ?? []).length > 0,
    async send(message, rendered): Promise<DeliveryReport> {
      const tokens = message.recipient.pushTokens ?? [];
      if (tokens.length === 0) return failed(NOTIFICATION_CHANNEL.PUSH, 'no push tokens');

      const result = await push.send(tokens, {
        title: rendered.title,
        body: rendered.body,
        ...(message.deepLink !== undefined ? { deepLink: message.deepLink } : {}),
        ...(message.imageUrl !== undefined ? { imageUrl: message.imageUrl } : {}),
      });

      if (result.invalidTokens.length > 0) {
        logger.debug({ count: result.invalidTokens.length }, 'push tokens reported as dead');
      }

      return {
        channel: NOTIFICATION_CHANNEL.PUSH,
        // Delivered to at least one device is a success; a user with three
        // devices and one stale token should still count as reached.
        status: result.sent > 0 ? 'SENT' : 'FAILED',
        ...(result.failureReason !== undefined ? { failureReason: result.failureReason } : {}),
        sentAt: new Date(),
      };
    },
  });

  if (telegram !== null) {
    providers.set(NOTIFICATION_CHANNEL.TELEGRAM, {
      channel: NOTIFICATION_CHANNEL.TELEGRAM,
      supports: (message) => message.recipient.telegramChatId !== undefined,
      async send(message, rendered): Promise<DeliveryReport> {
        const chatId = message.recipient.telegramChatId;
        if (chatId === undefined) return failed(NOTIFICATION_CHANNEL.TELEGRAM, 'no chat id');

        const result = await telegram.sendMessage({
          chatId,
          text: `<b>${escapeHtml(rendered.title)}</b>\n${escapeHtml(rendered.body)}`,
          ...(message.deepLink !== undefined
            ? {
                buttons: [
                  {
                    text: OPEN_LABEL[message.recipient.locale] ?? 'Открыть заказ',
                    url: `${config.telegram.webUrl}/${message.recipient.locale}${message.deepLink}`,
                  },
                ],
              }
            : {}),
        });

        return {
          channel: NOTIFICATION_CHANNEL.TELEGRAM,
          status: result.sent ? 'SENT' : 'FAILED',
          ...(result.messageId !== null ? { externalId: String(result.messageId) } : {}),
          ...(result.failureReason !== undefined ? { failureReason: result.failureReason } : {}),
          sentAt: new Date(),
        };
      },
    });
  }

  const email = createEmailProvider(config, logger);
  providers.set(NOTIFICATION_CHANNEL.EMAIL, {
    channel: NOTIFICATION_CHANNEL.EMAIL,
    supports: (message) => message.recipient.email !== undefined,
    async send(message, rendered): Promise<DeliveryReport> {
      const to = message.recipient.email;
      if (to === undefined) return failed(NOTIFICATION_CHANNEL.EMAIL, 'no email address');

      const result = await email.send({ to, subject: rendered.title, text: rendered.body });
      return {
        channel: NOTIFICATION_CHANNEL.EMAIL,
        status: result.accepted ? 'SENT' : 'FAILED',
        ...(result.externalId !== null ? { externalId: result.externalId } : {}),
        sentAt: new Date(),
      };
    },
  });

  // IN_APP has no external provider: the notification row itself is delivery,
  // and the websocket push is a bonus on top.
  providers.set(NOTIFICATION_CHANNEL.IN_APP, {
    channel: NOTIFICATION_CHANNEL.IN_APP,
    supports: () => true,
    async send(): Promise<DeliveryReport> {
      return { channel: NOTIFICATION_CHANNEL.IN_APP, status: 'DELIVERED', sentAt: new Date() };
    },
  });

  logger.info({ channels: [...providers.keys()] }, 'notification providers configured');

  return providers;
}

const failed = (channel: NotificationChannel, reason: string): DeliveryReport => ({
  channel,
  status: 'FAILED',
  failureReason: reason,
  sentAt: new Date(),
});

const OPEN_LABEL: Record<string, string> = {
  ru: 'Открыть заказ',
  uz: 'Buyurtmani ochish',
  en: 'Open order',
};

/** Telegram parses a small HTML subset; unescaped text breaks the message. */
const escapeHtml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export type { NotificationMessage, RenderedMessage };
