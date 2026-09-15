/**
 * The bot is a state machine over three commands; the one thing that must
 * not break is the link handshake (a wrong chat bound to an account gets
 * somebody else's orders), so that gets the closest look.
 */
import { describe, expect, it } from 'vitest';
import type { TelegramMessage } from '../../src/integrations/telegram/index.js';
import type { NotificationsRepository } from '../../src/modules/notifications/repository/notifications.repository.js';
import { TelegramBotService } from '../../src/modules/notifications/service/telegram-bot.service.js';

function bot() {
  const users = [
    {
      id: 'u1',
      firstName: 'Bobur',
      locale: 'ru',
      chatId: null as string | null,
      code: null as string | null,
    },
  ];
  const orders = [
    { id: 'o2', number: 'BZ-2', status: 'IN_DELIVERY' },
    { id: 'o1', number: 'BZ-1', status: 'DELIVERED' },
  ];
  const sent: TelegramMessage[] = [];
  const repository = {
    async setTelegramLinkCode(userId: string, code: string) {
      users.find((u) => u.id === userId)!.code = code;
    },
    async linkTelegram(code: string, chatId: string) {
      const user = users.find((u) => u.code === code);
      if (!user) return null;
      user.chatId = chatId;
      user.code = null;
      return { id: user.id, firstName: user.firstName, locale: user.locale };
    },
    async findByTelegramChat(chatId: string) {
      const user = users.find((u) => u.chatId === chatId);
      return user ? { id: user.id, firstName: user.firstName, locale: user.locale } : null;
    },
    async recentOrders(_userId: string, take: number) {
      return orders.slice(0, take);
    },
  } as unknown as NotificationsRepository;
  const service = new TelegramBotService({
    repository,
    telegram: {
      id: 'fake',
      async sendMessage(message) {
        sent.push(message);
        return { sent: true, messageId: sent.length };
      },
      async setWebhook() {
        return true;
      },
    },
    config: { webUrl: 'https://bazar.uz', botUsername: 'bazar_bot', webhookSecret: 's' },
    logger: { info() {}, warn() {} } as never,
  });
  const say = (text: string, chat = 777) =>
    service.handleUpdate({ message: { text, chat: { id: chat }, from: { language_code: 'en' } } });
  return { service, users, sent, say };
}

describe('telegram bot', () => {
  it('links a chat only through a fresh code, then burns it', async () => {
    const { service, users, sent, say } = bot();
    const { url } = await service.issueLink({ user: { id: 'u1' } } as never);
    const code = new URL(url).searchParams.get('start')!;
    expect(url.startsWith('https://t.me/bazar_bot?start=')).toBe(true);

    await say('/start nope');
    expect(users[0]!.chatId).toBeNull();
    expect(sent.at(-1)!.text).toContain('open the bazar app'); // unlinked → Telegram's language

    await say(`/start ${code}`);
    expect(users[0]!.chatId).toBe('777');
    expect(sent.at(-1)!.text).toContain('Готово, Bobur'); // linked → account locale

    await say(`/start ${code}`, 888);
    expect(users[0]!.chatId).toBe('777'); // second use of the code does nothing
  });

  it('lists orders with a status line and points buttons at the web app', async () => {
    const { service, sent, say } = bot();
    const { url } = await service.issueLink({ user: { id: 'u1' } } as never);
    await say(`/start ${new URL(url).searchParams.get('start')}`);

    await say('/orders');
    expect(sent.at(-1)!.text).toBe('Ваши заказы:\n<b>BZ-2</b> — В пути\n<b>BZ-1</b> — Доставлено');
    expect(sent.at(-1)!.buttons).toEqual([
      { text: 'Открыть', url: 'https://bazar.uz/ru/orders/o2' },
    ]);

    await say('/repeat');
    expect(sent.at(-1)!.buttons).toEqual([
      { text: 'Повторить', url: 'https://bazar.uz/ru/orders/o2?repeat=1' },
    ]);

    await say('hello');
    expect(sent.at(-1)!.text).toContain('/orders');
  });

  it('refuses to answer an unlinked chat with anything but the how-to', async () => {
    const { sent, say } = bot();
    await say('/orders');
    expect(sent.at(-1)!.text).toContain('open the bazar app');
    expect(sent.at(-1)!.buttons).toBeUndefined();
  });
});
