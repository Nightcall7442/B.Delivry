/**
 * Notifications business logic. Multi-channel delivery with fallback and templating.
 */
import {
  CHANNEL_FALLBACK_ORDER,
  DEFAULT_LOCALE,
  NOTIFICATION_CHANNEL,
  isLocale,
  type Locale,
  type NotificationChannel,
} from '@bazar/constants';
import {
  TEMPLATE,
  TEMPLATE_CHANNELS,
  TRANSACTIONAL_TEMPLATES,
  type NotificationProvider,
  type RenderedMessage,
  type TemplateKey,
} from '@bazar/notifications';
import type { Notification } from '@prisma/client';
import { BaseService, type ServiceDeps } from '../../../common/base/base.service.js';
import type { PaginatedResult } from '../../../common/pagination/index.js';
import { notificationsSent } from '../../../infrastructure/telemetry/metrics.js';
import type {
  NotificationsRepository,
  RecipientRow,
} from '../repository/notifications.repository.js';
import type {
  DirectSendRequest,
  NotificationListFilters,
  NotificationSender,
  Preferences,
  PreferencesPatch,
  SendRequest,
} from '../types/index.js';

/**
 * Message catalogue. It lives here rather than in @bazar/i18n because the API
 * does not otherwise depend on the frontend i18n bundles, and these strings go
 * out over SMS where every character costs money.
 *
 * {placeholders} are filled from the event params.
 */
type Catalog = Record<TemplateKey, Record<Locale, RenderedMessage>>;

const CATALOG: Catalog = {
  [TEMPLATE.AUTH_OTP]: {
    uz: {
      title: 'Kirish kodi',
      body: '{code} - Bazar Delivery kirish kodi. Amal qilish muddati {minutes} daqiqa.',
    },
    ru: {
      title: 'Код входа',
      body: '{code} - код для входа в Bazar Delivery. Действителен {minutes} мин.',
    },
    en: {
      title: 'Login code',
      body: '{code} is your Bazar Delivery login code. Valid for {minutes} minutes.',
    },
  },
  [TEMPLATE.ORDER_CREATED]: {
    uz: {
      title: 'Buyurtma qabul qilindi',
      body: '{orderNumber} raqamli buyurtmangiz qabul qilindi.',
    },
    ru: { title: 'Заказ принят', body: 'Ваш заказ {orderNumber} принят.' },
    en: { title: 'Order placed', body: 'Your order {orderNumber} has been placed.' },
  },
  [TEMPLATE.ORDER_CONFIRMED]: {
    uz: { title: 'Buyurtma tasdiqlandi', body: '{orderNumber} tasdiqlandi, kuryer qidirilmoqda.' },
    ru: { title: 'Заказ подтверждён', body: 'Заказ {orderNumber} подтверждён, ищем курьера.' },
    en: { title: 'Order confirmed', body: 'Order {orderNumber} confirmed, looking for a courier.' },
  },
  [TEMPLATE.ORDER_COURIER_ASSIGNED]: {
    uz: { title: 'Kuryer tayinlandi', body: '{orderNumber} uchun kuryer yo‘lga chiqdi.' },
    ru: { title: 'Курьер назначен', body: 'Курьер выехал за заказом {orderNumber}.' },
    en: { title: 'Courier assigned', body: 'A courier is on the way for order {orderNumber}.' },
  },
  [TEMPLATE.ORDER_PICKED_UP]: {
    uz: { title: 'Buyurtma olindi', body: '{orderNumber} kuryerda, yetkazilmoqda.' },
    ru: { title: 'Заказ забран', body: 'Заказ {orderNumber} у курьера.' },
    en: { title: 'Order picked up', body: 'Order {orderNumber} is with the courier.' },
  },
  [TEMPLATE.ORDER_IN_DELIVERY]: {
    uz: { title: 'Yo‘lda', body: '{orderNumber} sizga yetkazilmoqda.' },
    ru: { title: 'В пути', body: 'Заказ {orderNumber} едет к вам.' },
    en: { title: 'On the way', body: 'Order {orderNumber} is on its way to you.' },
  },
  [TEMPLATE.ORDER_COURIER_ARRIVED]: {
    uz: { title: 'Kuryer keldi', body: 'Kuryer {orderNumber} bilan yetib keldi.' },
    ru: { title: 'Курьер на месте', body: 'Курьер с заказом {orderNumber} на месте.' },
    en: { title: 'Courier arrived', body: 'The courier with order {orderNumber} has arrived.' },
  },
  [TEMPLATE.ORDER_DELIVERED]: {
    uz: { title: 'Yetkazildi', body: '{orderNumber} yetkazildi. Xaridingiz uchun rahmat!' },
    ru: { title: 'Доставлено', body: 'Заказ {orderNumber} доставлен. Спасибо за покупку!' },
    en: { title: 'Delivered', body: 'Order {orderNumber} has been delivered. Thank you!' },
  },
  [TEMPLATE.ORDER_CANCELLED]: {
    uz: { title: 'Bekor qilindi', body: '{orderNumber} bekor qilindi.' },
    ru: { title: 'Заказ отменён', body: 'Заказ {orderNumber} отменён.' },
    en: { title: 'Order cancelled', body: 'Order {orderNumber} has been cancelled.' },
  },
  [TEMPLATE.ORDER_FAILED]: {
    uz: {
      title: 'Buyurtma bajarilmadi',
      body: '{orderNumber} bajarilmadi, qo‘llab-quvvatlash xizmati bog‘lanadi.',
    },
    ru: {
      title: 'Заказ не выполнен',
      body: 'Заказ {orderNumber} не выполнен, с вами свяжется поддержка.',
    },
    en: {
      title: 'Order failed',
      body: 'Order {orderNumber} could not be completed. Support will contact you.',
    },
  },
  [TEMPLATE.PAYMENT_CAPTURED]: {
    uz: { title: 'To‘lov qabul qilindi', body: '{amount} {currency} to‘lov qabul qilindi.' },
    ru: { title: 'Платёж принят', body: 'Платёж {amount} {currency} принят.' },
    en: { title: 'Payment received', body: 'Payment of {amount} {currency} received.' },
  },
  [TEMPLATE.PAYMENT_FAILED]: {
    uz: { title: 'To‘lov amalga oshmadi', body: 'To‘lov amalga oshmadi, boshqa usulni tanlang.' },
    ru: { title: 'Платёж не прошёл', body: 'Платёж не прошёл, выберите другой способ оплаты.' },
    en: { title: 'Payment failed', body: 'The payment failed. Please try another method.' },
  },
  [TEMPLATE.PAYMENT_REFUNDED]: {
    uz: { title: 'Pul qaytarildi', body: '{amount} {currency} qaytarildi.' },
    ru: { title: 'Возврат средств', body: 'Возвращено {amount} {currency}.' },
    en: { title: 'Refunded', body: '{amount} {currency} has been refunded.' },
  },
  [TEMPLATE.COURIER_NEW_OFFER]: {
    uz: { title: 'Yangi buyurtma', body: '{distance} - {payout}. Qabul qilasizmi?' },
    ru: { title: 'Новый заказ', body: '{distance} - {payout}. Принять?' },
    en: { title: 'New order', body: '{distance} - {payout}. Accept?' },
  },
  [TEMPLATE.COURIER_PAYOUT]: {
    uz: { title: 'To‘lov', body: '{amount} {currency} hisobingizga o‘tkazildi.' },
    ru: { title: 'Выплата', body: '{amount} {currency} зачислено на ваш счёт.' },
    en: { title: 'Payout', body: '{amount} {currency} has been credited to your account.' },
  },
  [TEMPLATE.STORE_NEW_ORDER]: {
    uz: { title: 'Yangi buyurtma', body: '{orderNumber}: {itemCount} ta mahsulot.' },
    ru: { title: 'Новый заказ', body: '{orderNumber}: {itemCount} позиций.' },
    en: { title: 'New order', body: '{orderNumber}: {itemCount} items.' },
  },
  [TEMPLATE.SUPPORT_REPLY]: {
    uz: { title: 'Qo‘llab-quvvatlash javobi', body: '{ticketNumber} murojaatingizga javob keldi.' },
    ru: { title: 'Ответ поддержки', body: 'По обращению {ticketNumber} получен ответ.' },
    en: { title: 'Support replied', body: 'There is a reply on ticket {ticketNumber}.' },
  },
  [TEMPLATE.ORDER_FOR_RECIPIENT]: {
    uz: {
      title: 'Sizga buyurtma',
      body: '{from} sizga Bazar Delivery orqali {orderNumber} buyurtmasini joʻnatdi. Kuryer yoʻlda — telefon yoningizda boʻlsin.',
    },
    ru: {
      title: 'Вам заказ',
      body: '{from} отправил(а) вам заказ {orderNumber} через Bazar Delivery. Курьер уже едет — держите телефон рядом.',
    },
    en: {
      title: 'An order for you',
      body: '{from} sent you order {orderNumber} via Bazar Delivery. The courier is on the way — keep your phone close.',
    },
  },
  [TEMPLATE.PROMO]: {
    uz: { title: '{title}', body: '{body}' },
    ru: { title: '{title}', body: '{body}' },
    en: { title: '{title}', body: '{body}' },
  },
};

function interpolate(text: string, params: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in params ? String(params[key]) : match,
  );
}

export function render(
  template: TemplateKey,
  locale: Locale,
  params: Record<string, string | number>,
): RenderedMessage {
  const byLocale = CATALOG[template];
  // An unknown template would be a programming error, but a missing message
  // must not throw inside a notification job: fall back rather than fail.
  const entry = byLocale?.[locale] ?? byLocale?.[DEFAULT_LOCALE];

  if (entry === undefined) {
    return { title: template, body: template };
  }

  return {
    title: interpolate(entry.title, params),
    body: interpolate(entry.body, params),
  };
}

export interface NotificationsServiceDeps extends ServiceDeps {
  repository: NotificationsRepository;
  /** One provider per channel; a channel with no provider is simply skipped. */
  providers: Map<NotificationChannel, NotificationProvider>;
}

export class NotificationsService extends BaseService implements NotificationSender {
  private readonly repository: NotificationsRepository;
  private readonly providers: Map<NotificationChannel, NotificationProvider>;

  constructor(deps: NotificationsServiceDeps) {
    super(deps);
    this.repository = deps.repository;
    this.providers = deps.providers;
  }

  /**
   * Tries channels in order until one accepts the message. Push first because
   * it is free; SMS last because it is not. In-app is always written, so the
   * notification exists in the app even when every push token is stale.
   */
  async send(request: SendRequest): Promise<void> {
    const recipient = await this.repository.findRecipient(request.userId);
    if (recipient === null) {
      this.logger.warn({ userId: request.userId }, 'notification for unknown user');
      return;
    }

    // The request may name the customer rather than the user; from here on
    // every row is keyed by the resolved user.
    request = { ...request, userId: recipient.userId };

    const locale = isLocale(recipient.locale) ? recipient.locale : DEFAULT_LOCALE;
    const message = render(request.template, locale, request.params);
    const channels = this.channelsFor(request, recipient);

    await this.writeInApp(request, message);

    for (const channel of channels) {
      const provider = this.providers.get(channel);
      if (provider === undefined) continue;

      const payload = {
        template: request.template,
        recipient: {
          userId: recipient.userId,
          locale,
          phone: recipient.phone,
          ...(recipient.email !== null ? { email: recipient.email } : {}),
          ...(recipient.telegramChatId !== null
            ? { telegramChatId: recipient.telegramChatId }
            : {}),
          pushTokens: recipient.pushTokens,
        },
        params: request.params,
        ...(request.deepLink !== undefined ? { deepLink: request.deepLink } : {}),
        ...(request.imageUrl !== undefined ? { imageUrl: request.imageUrl } : {}),
      };

      if (!provider.supports(payload)) continue;

      const record = await this.repository.create({
        tenantId: request.tenantId,
        userId: request.userId,
        channel,
        template: request.template,
        title: message.title,
        body: message.body,
        deepLink: request.deepLink ?? null,
        orderId: request.orderId ?? null,
        idempotencyKey:
          request.idempotencyKey === undefined ? null : `${request.idempotencyKey}:${channel}`,
      });

      // Already sent on this channel for this key: another worker got there first.
      if (record === null) return;

      try {
        const report = await provider.send(payload, message);
        await this.repository.markSent(record.id, report.status, report.externalId ?? null, null);
        notificationsSent.labels(channel, report.status).inc();
        if (report.status === 'SENT' || report.status === 'DELIVERED') return;
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'unknown';
        await this.repository.markSent(record.id, 'FAILED', null, reason);
        notificationsSent.labels(channel, 'FAILED').inc();
        this.logger.warn({ err: error, channel }, 'notification channel failed, trying next');
      }
    }
  }

  /**
   * For recipients with no account yet: the OTP that creates the account.
   * Goes straight to SMS and is never stored as an in-app notification.
   */
  async sendDirect(request: DirectSendRequest): Promise<void> {
    const provider = this.providers.get(NOTIFICATION_CHANNEL.SMS);
    if (provider === undefined) {
      this.logger.error({ template: request.template }, 'no SMS provider configured');
      return;
    }

    const message = render(request.template, request.locale, request.params);
    const report = await provider.send(
      {
        template: request.template,
        recipient: { userId: '', locale: request.locale, phone: request.phone },
        params: request.params,
      },
      message,
    );
    notificationsSent.labels(NOTIFICATION_CHANNEL.SMS, report.status).inc();
  }

  private channelsFor(request: SendRequest, recipient: RecipientRow): NotificationChannel[] {
    const allowed = TEMPLATE_CHANNELS[request.template];

    // An explicit channel overrides the fallback chain, but still has to be
    // one the template permits: OTP must never go out as a push.
    if (request.channel !== undefined) {
      return allowed.includes(request.channel) ? [request.channel] : [];
    }

    const preferences = recipient.preferences;
    const marketing = !TRANSACTIONAL_TEMPLATES.includes(request.template);
    if (marketing && preferences?.marketing === false) return [];

    return CHANNEL_FALLBACK_ORDER.filter(
      (channel) => allowed.includes(channel) && this.channelEnabled(channel, preferences),
    );
  }

  /** Opt-outs apply to marketing and convenience channels, never to in-app. */
  private channelEnabled(channel: NotificationChannel, preferences: Preferences | null): boolean {
    if (preferences === null) return true;
    switch (channel) {
      case NOTIFICATION_CHANNEL.PUSH:
        return preferences.push;
      case NOTIFICATION_CHANNEL.SMS:
        return preferences.sms;
      case NOTIFICATION_CHANNEL.TELEGRAM:
        return preferences.telegram;
      case NOTIFICATION_CHANNEL.EMAIL:
        return preferences.email;
      default:
        return true;
    }
  }

  private async writeInApp(request: SendRequest, message: RenderedMessage): Promise<void> {
    if (!TEMPLATE_CHANNELS[request.template].includes(NOTIFICATION_CHANNEL.IN_APP)) return;

    await this.repository.create({
      tenantId: request.tenantId,
      userId: request.userId,
      channel: NOTIFICATION_CHANNEL.IN_APP,
      template: request.template,
      title: message.title,
      body: message.body,
      deepLink: request.deepLink ?? null,
      orderId: request.orderId ?? null,
      idempotencyKey:
        request.idempotencyKey === undefined ? null : `${request.idempotencyKey}:in-app`,
    });
  }

  // ------------------------------------------------------------------ reads

  async list(filters: NotificationListFilters): Promise<PaginatedResult<Notification>> {
    return this.repository.list(this.currentUser().id, filters);
  }

  async unreadCount(): Promise<number> {
    return this.repository.countUnread(this.currentUser().id);
  }

  async markRead(ids: string[]): Promise<number> {
    return this.repository.markRead(this.currentUser().id, ids);
  }

  async markAllRead(): Promise<number> {
    return this.repository.markAllRead(this.currentUser().id);
  }

  async getPreferences(): Promise<Preferences> {
    return this.repository.getPreferences(this.currentUser().id);
  }

  async updatePreferences(preferences: PreferencesPatch): Promise<Preferences> {
    return this.repository.savePreferences(this.currentUser().id, preferences);
  }

  async registerPushToken(token: string, platform: string, deviceId?: string): Promise<void> {
    const user = this.currentUser();
    await this.repository.savePushToken(user.id, token, platform, deviceId);
    this.logger.debug({ userId: user.id, platform }, 'push token registered');
  }

  /** Called by the push provider when a token is rejected as gone. */
  async invalidatePushToken(token: string): Promise<void> {
    await this.repository.invalidatePushToken(token);
  }

  async findRecipient(userId: string): Promise<RecipientRow | null> {
    return this.repository.findRecipient(userId);
  }
}
