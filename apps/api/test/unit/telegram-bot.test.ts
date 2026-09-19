/**
 * The bot is a state machine over three commands; the one thing that must
 * not break is the link handshake (a wrong chat bound to an account gets
 * somebody else's orders), so that gets the closest look.
 */
import { describe, expect, it } from 'vitest';
import { MemoryCache } from '../../src/infrastructure/redis/cache.js';
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
    async telegramChatByPhone(_tenantId: string, phone: string) {
      return phone === '+998901112233' ? (users[0]!.chatId ?? null) : null;
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
    cache: new MemoryCache(),
    logger: { info() {}, warn() {} } as never,
  });
  const say = (text: string, chat = 777) =>
    service.handleUpdate({
      message: { text, chat: { id: chat }, from: { id: chat, language_code: 'en' } },
    });
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

  it('signs in through a shared contact, but only the sender’s own, and only once', async () => {
    const { service, sent, say } = bot();
    const logins: string[] = [];
    service.setLoginHandler(async ({ phone, chatId }) => {
      logins.push(`${phone}@${chatId}`);
      return 'done';
    });
    const { code, url } = await service.startLogin('t1');
    expect(url).toBe(`https://t.me/bazar_bot?start=login_${code}`);
    expect(await service.readLogin(code)).toEqual({ tenantId: 't1', status: 'pending' });

    await say('/start login_stale');
    expect(sent.at(-1)!.text).toContain('expired');

    await say(`/start login_${code}`);
    expect(sent.at(-1)!.keyboard).toEqual([{ text: 'Share my number', requestContact: true }]);

    // Somebody else's contact card: refused, no login.
    await service.handleUpdate({
      message: {
        chat: { id: 777 },
        from: { id: 777, language_code: 'en' },
        contact: { phone_number: '998901112233', user_id: 999 },
      },
    });
    expect(logins).toEqual([]);
    expect(sent.at(-1)!.text).toContain('your own number');

    await service.handleUpdate({
      message: {
        chat: { id: 777 },
        from: { id: 777, first_name: 'Bobur', language_code: 'en' },
        contact: { phone_number: '998901112233', user_id: 777 },
      },
    });
    expect(logins).toEqual(['+998901112233@777']);
    expect(sent.at(-1)!.text).toContain('Done, Bobur');
    expect(sent.at(-1)!.removeKeyboard).toBe(true);

    // The chat's pending code is gone: a second contact does not sign in again.
    await service.handleUpdate({
      message: {
        chat: { id: 777 },
        from: { id: 777, language_code: 'en' },
        contact: { phone_number: '998901112233', user_id: 777 },
      },
    });
    expect(logins).toHaveLength(1);
  });

  it('hands a finished ticket over exactly once', async () => {
    const { service } = bot();
    const { code } = await service.startLogin('t1');
    await service.completeLogin(code, { tenantId: 't1', status: 'done', result: { ok: 1 } });
    expect(await service.readLogin<{ status: string }>(code)).toMatchObject({ status: 'done' });
    expect(await service.readLogin(code)).toBeNull();
  });

  it('sends the login code to a linked chat and reports when there is none', async () => {
    const { service, users, sent } = bot();
    expect(await service.sendLoginCode('t1', '+998901112233', 'ru', '123456', 5)).toBe(false);
    users[0]!.chatId = '777';
    expect(await service.sendLoginCode('t1', '+998901112233', 'ru', '123456', 5)).toBe(true);
    expect(sent.at(-1)!.text).toContain('<b>123456</b>');
    expect(await service.sendLoginCode('t1', '+998900000000', 'ru', '123456', 5)).toBe(false);
  });

  it('refuses to answer an unlinked chat with anything but the how-to', async () => {
    const { sent, say } = bot();
    await say('/orders');
    expect(sent.at(-1)!.text).toContain('open the bazar app');
    expect(sent.at(-1)!.buttons).toBeUndefined();
  });
});
