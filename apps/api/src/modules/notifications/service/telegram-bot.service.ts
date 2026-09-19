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
import type { CacheStore } from '../../../infrastructure/redis/cache.js';
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
    from?: { id?: number; first_name?: string; language_code?: string };
    /** The «share my number» button answers with this. */
    contact?: { phone_number: string; user_id?: number; first_name?: string };
  };
}

/** `t.me/<bot>?start=login_<code>` — the prefix keeps login codes apart from account-link codes. */
const LOGIN_PREFIX = 'login_';
export const TELEGRAM_LOGIN_TTL_SECONDS = 300;
const ticketKey = (code: string) => `tg-login:${code}`;
const chatKey = (chatId: string) => `tg-login-chat:${chatId}`;

/** What the auth module does once the bot has a verified phone for a login code. */
export type TelegramLoginHandler = (input: {
  code: string;
  phone: string;
  chatId: string;
  firstName: string | null;
  locale: Locale;
}) => Promise<'done' | 'expired'>;

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
    loginAsk:
      'Чтобы войти в bazar, нажмите кнопку ниже — Telegram отправит нам ваш номер. Мы не видим ничего, кроме номера.',
    shareContact: 'Поделиться номером',
    loginDone:
      'Готово, {name}! Возвращайтесь в приложение — вы уже вошли.\nСюда будут приходить обновления по заказам.',
    loginExpired: 'Ссылка устарела. Нажмите «Войти через Telegram» в приложении ещё раз.',
    loginNotYours: 'Нужен ваш собственный номер — нажмите кнопку «Поделиться номером».',
    loginCode: 'Код для входа в bazar: <b>{code}</b>. Действителен {minutes} мин.',
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
    loginAsk:
      'bazar’ga kirish uchun pastdagi tugmani bosing — Telegram bizga raqamingizni yuboradi. Raqamdan boshqa hech narsani koʻrmaymiz.',
    shareContact: 'Raqamni yuborish',
    loginDone:
      'Tayyor, {name}! Ilovaga qayting — siz kirdingiz.\nBuyurtma yangiliklari shu yerga keladi.',
    loginExpired: 'Havola eskirgan. Ilovada «Telegram orqali kirish» tugmasini yana bosing.',
    loginNotYours: 'Oʻzingizning raqamingiz kerak — «Raqamni yuborish» tugmasini bosing.',
    loginCode: 'bazar’ga kirish kodi: <b>{code}</b>. {minutes} daqiqa amal qiladi.',
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
    loginAsk:
      'To sign in to bazar, tap the button below — Telegram sends us your number. We see nothing but the number.',
    shareContact: 'Share my number',
    loginDone:
      'Done, {name}! Go back to the app — you are signed in.\nOrder updates will land here.',
    loginExpired: 'The link has expired. Tap “Sign in with Telegram” in the app again.',
    loginNotYours: 'It has to be your own number — tap “Share my number”.',
    loginCode: 'Your bazar login code: <b>{code}</b>. Valid for {minutes} minutes.',
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
  cache: CacheStore;
  logger: Logger;
}

export class TelegramBotService {
  private onLogin: TelegramLoginHandler | null = null;

  constructor(private readonly deps: TelegramBotDeps) {}

  /** Auth is built after the bot; it plugs in the part that signs people in. */
  setLoginHandler(handler: TelegramLoginHandler): void {
    this.onLogin = handler;
  }

  /** The bot is usable for login when it has a token and a username to link to. */
  get canLogin(): boolean {
    return this.deps.telegram !== null && this.deps.config.botUsername !== undefined;
  }

  /**
   * A login code over the bot instead of an SMS — free, and it lands where the
   * person already reads us. False when the phone has no chat linked (or the
   * bot is off), and the caller falls back to SMS.
   */
  async sendLoginCode(
    tenantId: string,
    phone: string,
    locale: Locale,
    code: string,
    minutes: number,
  ): Promise<boolean> {
    if (this.deps.telegram === null) return false;
    const chatId = await this.deps.repository.telegramChatByPhone(tenantId, phone);
    if (chatId === null) return false;
    const text = TEXT[locale].loginCode
      .replace('{code}', code)
      .replace('{minutes}', String(minutes));
    const result = await this.deps.telegram.sendMessage({ chatId, text });
    return result.sent;
  }

  /** Opens a login ticket; the app shows the link and polls `loginStatus` until the bot completes it. */
  async startLogin(tenantId: string): Promise<{ code: string; url: string; expiresIn: number }> {
    const username = this.deps.config.botUsername;
    if (username === undefined || this.deps.telegram === null) {
      throw new ConflictError('Telegram bot is not configured');
    }
    const code = randomBytes(18).toString('base64url');
    await this.deps.cache.set(
      ticketKey(code),
      { tenantId, status: 'pending' },
      TELEGRAM_LOGIN_TTL_SECONDS,
    );
    return {
      code,
      url: `https://t.me/${username}?start=${LOGIN_PREFIX}${code}`,
      expiresIn: TELEGRAM_LOGIN_TTL_SECONDS,
    };
  }

  /** Reads a ticket; a finished one is handed over exactly once. */
  async readLogin<T extends { status: string }>(code: string): Promise<T | null> {
    const ticket = await this.deps.cache.get<T>(ticketKey(code));
    if (ticket !== null && ticket.status === 'done') await this.deps.cache.del(ticketKey(code));
    return ticket;
  }

  async completeLogin(code: string, ticket: unknown): Promise<void> {
    // Two minutes for the app to pick the tokens up; then they are gone.
    await this.deps.cache.set(ticketKey(code), ticket, 120);
  }

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
    if (message === undefined) return;
    const chatId = String(message.chat.id);
    const guessed = isLocale(message.from?.language_code)
      ? message.from.language_code
      : DEFAULT_LOCALE;

    // The «share my number» answer: Telegram vouches that the contact is the sender's own.
    if (message.contact !== undefined) {
      const t = TEXT[guessed];
      const code = await this.deps.cache.get<string>(chatKey(chatId));
      if (code === null || this.onLogin === null) return this.reply(chatId, t.loginExpired);
      if (message.contact.user_id === undefined || message.contact.user_id !== message.from?.id) {
        return this.reply(chatId, t.loginNotYours);
      }
      const digits = message.contact.phone_number.replace(/\D/g, '');
      const outcome = await this.onLogin({
        code,
        phone: `+${digits}`,
        chatId,
        firstName: message.contact.first_name ?? message.from?.first_name ?? null,
        locale: guessed,
      });
      await this.deps.cache.del(chatKey(chatId));
      if (outcome === 'expired') return this.reply(chatId, t.loginExpired, undefined, true);
      return this.reply(
        chatId,
        t.loginDone.replace('{name}', message.from?.first_name ?? ''),
        undefined,
        true,
      );
    }

    const text = message.text?.trim();
    if (text === undefined) return;

    if (text.startsWith(`/start ${LOGIN_PREFIX}`)) {
      const code = text.slice(`/start ${LOGIN_PREFIX}`.length).trim();
      const t = TEXT[guessed];
      const ticket = await this.deps.cache.get<{ status: string }>(ticketKey(code));
      if (ticket === null || ticket.status !== 'pending') return this.reply(chatId, t.loginExpired);
      await this.deps.cache.set(chatKey(chatId), code, TELEGRAM_LOGIN_TTL_SECONDS);
      return this.send({
        chatId,
        text: t.loginAsk,
        keyboard: [{ text: t.shareContact, requestContact: true }],
      });
    }

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
    // Telegram only calls https; a dev API on localhost must not try (and fail) on every restart —
    // and must never steal the webhook from production when it runs behind a tunnel.
    if (!url.startsWith('https://')) {
      logger.info(
        { url },
        'telegram webhook skipped: not https (drive /webhooks/telegram by hand)',
      );
      return;
    }
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
    removeKeyboard = false,
  ): Promise<void> {
    return this.send({
      chatId,
      text,
      ...(buttons !== undefined ? { buttons } : {}),
      ...(removeKeyboard ? { removeKeyboard } : {}),
    });
  }

  private async send(message: TelegramMessage): Promise<void> {
    if (this.deps.telegram === null) {
      // No token: the conversation is visible in the log, which is what dev needs.
      this.deps.logger.info({ telegram: message }, 'telegram reply (dry run)');
      return;
    }
    await this.deps.telegram.sendMessage(message);
  }
}
