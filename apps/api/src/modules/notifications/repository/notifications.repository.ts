/**
 * Notifications persistence (Prisma). Tenant-scoped.
 */
import type { NotificationChannel, NotificationStatus } from '@bazar/constants';
import { compact } from '@bazar/utils';
import type { Notification, Prisma } from '@prisma/client';
import { BaseRepository } from '../../../common/base/base.repository.js';
import {
  normalizeCursor,
  paginateCursor,
  toPrismaCursor,
  type PaginatedResult,
} from '../../../common/pagination/index.js';
import type { NotificationListFilters, Preferences, PreferencesPatch } from '../types/index.js';

/** Everything needed to deliver to a person, in one query. */
export interface RecipientRow {
  userId: string;
  locale: string;
  phone: string;
  email: string | null;
  telegramChatId: string | null;
  pushTokens: string[];
  preferences: Preferences | null;
}

/** What the Telegram bot needs to know about the person behind a chat. */
export interface TelegramUserRow {
  id: string;
  firstName: string | null;
  locale: string;
}

const DEFAULT_PREFERENCES: Preferences = {
  push: true,
  sms: true,
  telegram: true,
  email: false,
  marketing: true,
};

export class NotificationsRepository extends BaseRepository {
  async findRecipient(userId: string): Promise<RecipientRow | null> {
    // Order and payment events carry the customer id, not the user id, and a
    // recipient is either; the customer relation resolves the second form.
    const user = await this.prisma.user.findFirst({
      where: { OR: [{ id: userId }, { customer: { id: userId } }], deletedAt: null },
      select: {
        id: true,
        locale: true,
        phone: true,
        email: true,
        telegramChatId: true,
        pushTokens: { where: { invalidAt: null }, select: { token: true } },
      },
    });
    if (user === null) return null;

    const preferences = await this.prisma.notificationPreference.findUnique({
      where: { userId: user.id },
    });

    return {
      userId: user.id,
      locale: user.locale,
      phone: user.phone,
      email: user.email,
      telegramChatId: user.telegramChatId,
      pushTokens: user.pushTokens.map((row) => row.token),
      preferences: preferences ?? DEFAULT_PREFERENCES,
    };
  }

  // ------------------------------------------------------------ telegram bot

  async setTelegramLinkCode(userId: string, code: string): Promise<void> {
    await this.prisma.user.update({ where: { id: userId }, data: { telegramLinkCode: code } });
  }

  /** Burns the code and binds the chat; null when the code is unknown. */
  async linkTelegram(code: string, chatId: string): Promise<TelegramUserRow | null> {
    const user = await this.prisma.user.findUnique({
      where: { telegramLinkCode: code },
      select: { id: true },
    });
    if (user === null) return null;
    // Another account may hold this chat from before; a chat belongs to one person.
    await this.prisma.user.updateMany({
      where: { telegramChatId: chatId, NOT: { id: user.id } },
      data: { telegramChatId: null },
    });
    return this.prisma.user.update({
      where: { id: user.id },
      data: { telegramChatId: chatId, telegramLinkCode: null },
      select: { id: true, firstName: true, locale: true },
    });
  }

  findByTelegramChat(chatId: string): Promise<TelegramUserRow | null> {
    return this.prisma.user.findUnique({
      where: { telegramChatId: chatId },
      select: { id: true, firstName: true, locale: true },
    });
  }

  recentOrders(
    userId: string,
    take: number,
  ): Promise<{ id: string; number: string; status: string }[]> {
    return this.prisma.order.findMany({
      where: { customer: { userId } },
      orderBy: { createdAt: 'desc' },
      take,
      select: { id: true, number: true, status: true },
    });
  }

  /**
   * Returns null when the idempotency key was already used, so the caller can
   * skip sending. A unique constraint does the deduplication, which is the only
   * version that holds when two workers race.
   */
  async create(data: {
    tenantId: string;
    userId: string;
    channel: NotificationChannel;
    template: string;
    title: string;
    body: string;
    deepLink?: string | null;
    orderId?: string | null;
    idempotencyKey?: string | null;
  }): Promise<Notification | null> {
    try {
      return await this.prisma.notification.create({
        data: {
          tenantId: data.tenantId,
          userId: data.userId,
          channel: data.channel,
          template: data.template,
          title: data.title,
          body: data.body,
          deepLink: data.deepLink ?? null,
          orderId: data.orderId ?? null,
          idempotencyKey: data.idempotencyKey ?? null,
        },
      });
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        (error as { code?: string }).code === 'P2002'
      ) {
        return null;
      }
      throw error;
    }
  }

  async markSent(
    id: string,
    status: NotificationStatus,
    externalId: string | null,
    failureReason: string | null,
  ): Promise<void> {
    await this.prisma.notification.update({
      where: { id },
      data: { status, externalId, failureReason, sentAt: new Date() },
    });
  }

  async list(
    userId: string,
    filters: NotificationListFilters,
  ): Promise<PaginatedResult<Notification>> {
    const where: Prisma.NotificationWhereInput = {
      ...this.tenantScope(),
      userId,
      ...(filters.unreadOnly === true ? { readAt: null } : {}),
      ...(filters.channel !== undefined ? { channel: filters.channel } : {}),
    };

    const params = normalizeCursor(filters);
    const rows = await this.prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      ...toPrismaCursor(params),
    });
    return paginateCursor(rows, params);
  }

  async countUnread(userId: string): Promise<number> {
    return this.prisma.notification.count({
      where: { ...this.tenantScope(), userId, readAt: null },
    });
  }

  /** Scoped by userId as well as id: nobody marks someone else's mail as read. */
  async markRead(userId: string, ids: string[]): Promise<number> {
    const result = await this.prisma.notification.updateMany({
      where: { ...this.tenantScope(), userId, id: { in: ids }, readAt: null },
      data: { readAt: new Date(), status: 'READ' },
    });
    return result.count;
  }

  async markAllRead(userId: string): Promise<number> {
    const result = await this.prisma.notification.updateMany({
      where: { ...this.tenantScope(), userId, readAt: null },
      data: { readAt: new Date(), status: 'READ' },
    });
    return result.count;
  }

  async getPreferences(userId: string): Promise<Preferences> {
    const row = await this.prisma.notificationPreference.findUnique({ where: { userId } });
    return row ?? DEFAULT_PREFERENCES;
  }

  async savePreferences(userId: string, preferences: PreferencesPatch): Promise<Preferences> {
    // Undefined keys are dropped: to Prisma an explicit undefined is a value,
    // and "leave this alone" has to be an absent key.
    const patch = compact(preferences);

    return this.prisma.notificationPreference.upsert({
      where: { userId },
      create: { userId, ...DEFAULT_PREFERENCES, ...patch },
      update: patch,
    });
  }

  async savePushToken(
    userId: string,
    token: string,
    platform: string,
    deviceId?: string,
  ): Promise<void> {
    // Upsert on the token itself: reinstalling the app on the same device
    // reuses the token, and it may now belong to a different account.
    await this.prisma.pushToken.upsert({
      where: { token },
      create: { userId, token, platform, deviceId: deviceId ?? null },
      update: { userId, platform, deviceId: deviceId ?? null, invalidAt: null },
    });
  }

  /** Provider reported the token as dead; stop trying it. */
  async invalidatePushToken(token: string): Promise<void> {
    await this.prisma.pushToken.updateMany({
      where: { token },
      data: { invalidAt: new Date() },
    });
  }
}
