/**
 * Telegram Bot API adapter.
 */
import type { Logger } from '../../../infrastructure/logger/index.js';
import { providerErrors } from '../../../infrastructure/telemetry/metrics.js';
import type {
  TelegramMessage,
  TelegramProvider,
  TelegramResult,
} from '../telegram-provider.interface.js';

/**
 * Telegram matters more here than it would elsewhere: many bazaar sellers run
 * their business through it, and a bot message costs nothing where an SMS does.
 * Store owners get new-order alerts this way.
 */
export class TelegramBotProvider implements TelegramProvider {
  readonly id = 'telegram';

  constructor(
    private readonly botToken: string,
    private readonly logger: Logger,
  ) {}

  private url(method: string): string {
    return `https://api.telegram.org/bot${this.botToken}/${method}`;
  }

  async sendMessage(message: TelegramMessage): Promise<TelegramResult> {
    try {
      const response = await fetch(this.url('sendMessage'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          chat_id: message.chatId,
          text: message.text,
          parse_mode: message.parseMode ?? 'HTML',
          disable_notification: message.disableNotification ?? false,
          ...(message.buttons !== undefined && message.buttons.length > 0
            ? { reply_markup: { inline_keyboard: [message.buttons] } }
            : message.keyboard !== undefined
              ? {
                  reply_markup: {
                    keyboard: [
                      message.keyboard.map((key) => ({
                        text: key.text,
                        request_contact: key.requestContact ?? false,
                      })),
                    ],
                    one_time_keyboard: true,
                    resize_keyboard: true,
                  },
                }
              : message.removeKeyboard
                ? { reply_markup: { remove_keyboard: true } }
                : {}),
        }),
      });

      const body = (await response.json()) as {
        ok: boolean;
        result?: { message_id: number };
        description?: string;
      };

      if (!body.ok) {
        providerErrors.labels('telegram', 'send').inc();
        return { sent: false, messageId: null, failureReason: body.description ?? 'rejected' };
      }

      return { sent: true, messageId: body.result?.message_id ?? null };
    } catch (error) {
      providerErrors.labels('telegram', 'send').inc();
      this.logger.warn({ err: error }, 'telegram send failed');
      return { sent: false, messageId: null, failureReason: 'request failed' };
    }
  }

  async setWebhook(url: string, secret: string): Promise<boolean> {
    try {
      const response = await fetch(this.url('setWebhook'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // Telegram echoes this back as a header, which is how the webhook
        // route tells a real update from someone guessing the URL.
        body: JSON.stringify({ url, secret_token: secret }),
      });

      const body = (await response.json()) as { ok: boolean };
      return body.ok;
    } catch (error) {
      this.logger.error({ err: error }, 'failed to set telegram webhook');
      return false;
    }
  }
}
