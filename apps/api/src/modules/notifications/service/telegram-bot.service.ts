/**
 * The customer-facing Telegram bot: link a chat to an account, then answer
 * "where is my order" and "order that again" without the app. Status pushes
 * themselves ride the notifications channel once the chat is linked; this
 * file only handles what the person types.
 *
 * Telegram calls /webhooks/telegram with an Update; we answer by sending a
 * message back, never by replying to the webhook body.
 */
import {
  DEFAULT_LOCALE,
  ORDER_STATUS,
  isLocale,
  type Locale,
  type OrderStatus,
} from '@bazar/constants';
import { TEMPLATE } from '@bazar/notifications';
import { randomBytes } from 'node:crypto';
import { ConflictError, UnauthorizedError } from '../../../common/errors/domain.errors.js';
import type { RequestContext } from '../../../common/types/request-context.js';
import type { NotificationsConfig } from '../../../config/index.js';
import type { Logger } from '../../../infrastructure/logger/index.js';
import type { TelegramMessage, TelegramProvider } from '../../../integrations/telegram/index.js';
import type { NotificationsRepository } from '../repository/notifications.repository.js';
import { render } from './notifications.service.js';

/** The slice of a Telegram Update we act on. */
export interface TelegramUpdate {
  message?: {
    text?: string;
    chat: { id: number | string };
    from?: { first_name?: string; language_code?: string };
  };
}

const TEXT = {
  ru: {
    linked:
      'Готово, {name}! Сюда будут приходить обновления по заказам.\n/orders — мои заказы\n/repeat — повторить последний',
    notLinked: 'Чтобы подключить бота, откройте приложение bazar → меню → «Telegram-бот».',
    noOrders: 'Заказов пока нет.',
    orders: 'Ваши заказы:',
    repeat: 'Повторить заказ {orderNumber}? Откройте его в приложении — корзина соберётся сама.',
    open: 'Открыть',
    repeatBtn: 'Повторить',
    help: 'Команды:\n/orders — мои заказы\n/repeat — повторить последний заказ',
  },
  uz: {
    linked:
      'Tayyor, {name}! Buyurtma yangiliklari shu yerga keladi.\n/orders — buyurtmalarim\n/repeat — oxirgisini takrorlash',
    notLinked: 'Botni ulash uchun bazar ilovasini oching → menyu → «Telegram-bot».',
    noOrders: 'Hali buyurtmalar yoʻq.',
    orders: 'Buyurtmalaringiz:',
    repeat: '{orderNumber} buyurtmasini takrorlaysizmi? Ilovada oching — savat oʻzi yigʻiladi.',
    open: 'Ochish',
    repeatBtn: 'Takrorlash',
    help: 'Buyruqlar:\n/orders — buyurtmalarim\n/repeat — oxirgi buyurtmani takrorlash',
  },
  en: {
    linked:
      'Done, {name}! Order updates will land here.\n/orders — my orders\n/repeat — repeat the last one',
    notLinked: 'To connect the bot, open the bazar app → menu → "Telegram bot".',
    noOrders: 'No orders yet.',
    orders: 'Your orders:',
    repeat: 'Repeat order {orderNumber}? Open it in the app — the cart fills itself.',
    open: 'Open',
    repeatBtn: 'Repeat',
    help: 'Commands:\n/orders — my orders\n/repeat — repeat the last order',
  },
} satisfies Record<Locale, Record<string, string>>;

/**
 * Short status line per order. The notification catalogue already has a
 * title for every status a person cares about; the in-between ones borrow
 * the nearest.
 */
const STATUS_TEMPLATE: Record<OrderStatus, keyof typeof TEMPLATE> = {
  [ORDER_STATUS.PENDING]: 'ORDER_CREATED',
  [ORDER_STATUS.CONFIRMED]: 'ORDER_CONFIRMED',
  [ORDER_STATUS.SEARCHING_COURIER]: 'ORDER_CONFIRMED',
  [ORDER_STATUS.COURIER_ASSIGNED]: 'ORDER_COURIER_ASSIGNED',
  [ORDER_STATUS.COURIER_ARRIVED_PICKUP]: 'ORDER_COURIER_ASSIGNED',
  [ORDER_STATUS.PICKING_UP]: 'ORDER_COURIER_ASSIGNED',
  [ORDER_STATUS.PICKED_UP]: 'ORDER_PICKED_UP',
  [ORDER_STATUS.IN_DELIVERY]: 'ORDER_IN_DELIVERY',
  [ORDER_STATUS.COURIER_ARRIVED]: 'ORDER_COURIER_ARRIVED',
  [ORDER_STATUS.DELIVERED]: 'ORDER_DELIVERED',
  [ORDER_STATUS.CANCELLED]: 'ORDER_CANCELLED',
  [ORDER_STATUS.FAILED]: 'ORDER_FAILED',
  [ORDER_STATUS.REFUNDED]: 'PAYMENT_REFUNDED',
};

export interface TelegramBotDeps {
  repository: NotificationsRepository;
  telegram: TelegramProvider | null;
  config: NotificationsConfig['telegram'];
  logger: Logger;
}

export class TelegramBotService {
  constructor(private readonly deps: TelegramBotDeps) {}

  /** t.me deep link for the signed-in user; the code is single-use. */
  async issueLink(context: RequestContext): Promise<{ url: string }> {
    const username = this.deps.config.botUsername;
    if (username === undefined) throw new ConflictError('Telegram bot is not configured');
    if (context.user === null) throw new UnauthorizedError();
    const code = randomBytes(18).toString('base64url');
    await this.deps.repository.setTelegramLinkCode(context.user.id, code);
    return { url: `https://t.me/${username}?start=${code}` };
  }

  async handleUpdate(update: TelegramUpdate): Promise<void> {
    const message = update.message;
    const text = message?.text?.trim();
    if (message === undefined || text === undefined) return;
    const chatId = String(message.chat.id);

    if (text.startsWith('/start')) {
      const code = text.slice('/start'.length).trim();
      const user = code === '' ? null : await this.deps.repository.linkTelegram(code, chatId);
      if (user === null) {
        const locale = isLocale(message.from?.language_code)
          ? message.from.language_code
          : DEFAULT_LOCALE;
        return this.reply(chatId, TEXT[locale].notLinked);
      }
      const t = TEXT[this.locale(user.locale)];
      return this.reply(
        chatId,
        t.linked.replace('{name}', user.firstName ?? message.from?.first_name ?? ''),
      );
    }

    const user = await this.deps.repository.findByTelegramChat(chatId);
    if (user === null) {
      const locale = isLocale(message.from?.language_code)
        ? message.from.language_code
        : DEFAULT_LOCALE;
      return this.reply(chatId, TEXT[locale].notLinked);
    }
    const locale = this.locale(user.locale);
    const t = TEXT[locale];

    if (text.startsWith('/orders')) {
      const orders = await this.deps.repository.recentOrders(user.id, 3);
      if (orders.length === 0) return this.reply(chatId, t.noOrders);
      const lines = orders.map((order) => {
        const { title } = render(TEMPLATE[STATUS_TEMPLATE[order.status as OrderStatus]], locale, {
          orderNumber: order.number,
        });
        return `<b>${order.number}</b> — ${title}`;
      });
      const [latest] = orders;
      return this.reply(chatId, `${t.orders}\n${lines.join('\n')}`, [
        { text: t.open, url: this.orderUrl(locale, latest!.id) },
      ]);
    }

    if (text.startsWith('/repeat')) {
      const [latest] = await this.deps.repository.recentOrders(user.id, 1);
      if (latest === undefined) return this.reply(chatId, t.noOrders);
      return this.reply(chatId, t.repeat.replace('{orderNumber}', latest.number), [
        { text: t.repeatBtn, url: `${this.orderUrl(locale, latest.id)}?repeat=1` },
      ]);
    }

    return this.reply(chatId, t.help);
  }

  /** Points Telegram at us. Skipped (with a log line) until token + secret exist. */
  async registerWebhook(apiBaseUrl: string): Promise<void> {
    const { telegram, config, logger } = this.deps;
    if (telegram === null || config.webhookSecret === undefined) {
      logger.info(
        'telegram bot off: set TELEGRAM_BOT_TOKEN, TELEGRAM_BOT_USERNAME, TELEGRAM_WEBHOOK_SECRET',
      );
      return;
    }
    const url = `${apiBaseUrl}/webhooks/telegram`;
    const ok = await telegram.setWebhook(url, config.webhookSecret);
    logger.info({ url, ok }, 'telegram webhook');
  }

  private locale(value: string): Locale {
    return isLocale(value) ? value : DEFAULT_LOCALE;
  }

  private orderUrl(locale: Locale, orderId: string): string {
    return `${this.deps.config.webUrl}/${locale}/orders/${orderId}`;
  }

  private async reply(
    chatId: string,
    text: string,
    buttons?: TelegramMessage['buttons'],
  ): Promise<void> {
    const message: TelegramMessage = {
      chatId,
      text,
      ...(buttons !== undefined ? { buttons } : {}),
    };
    if (this.deps.telegram === null) {
      // No token: the conversation is visible in the log, which is what dev needs.
      this.deps.logger.info({ telegram: message }, 'telegram reply (dry run)');
      return;
    }
    await this.deps.telegram.sendMessage(message);
  }
}
