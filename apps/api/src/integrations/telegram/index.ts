/**
 * Telegram integration barrel.
 */
import type { NotificationsConfig } from '../../config/index.js';
import type { Logger } from '../../infrastructure/logger/index.js';
import { TelegramBotProvider } from './providers/bot-api.provider.js';
import type { TelegramProvider } from './telegram-provider.interface.js';

export * from './telegram-provider.interface.js';
export { TelegramBotProvider };

/** Returns null when no bot token is configured: the channel is simply off. */
export function createTelegramProvider(
  config: NotificationsConfig,
  logger: Logger,
): TelegramProvider | null {
  const token = config.telegram.botToken;
  return token === undefined ? null : new TelegramBotProvider(token, logger);
}
