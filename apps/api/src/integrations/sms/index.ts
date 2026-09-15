/**
 * SmsProvider factory.
 */
import type { NotificationsConfig } from '../../config/index.js';
import type { Logger } from '../../infrastructure/logger/index.js';
import { ConsoleSmsProvider } from './providers/console.provider.js';
import { EskizSmsProvider } from './providers/eskiz.provider.js';
import { PlaymobileSmsProvider } from './providers/playmobile.provider.js';
import type { SmsProvider } from './sms-provider.interface.js';

export * from './sms-provider.interface.js';

export function createSmsProvider(config: NotificationsConfig, logger: Logger): SmsProvider {
  const sms = config.sms;

  // The env schema already guarantees the credentials exist for the selected
  // provider, so a missing block here means the config was built by hand.
  if (sms.provider === 'eskiz' && sms.eskiz !== undefined) {
    return new EskizSmsProvider(sms.eskiz, logger);
  }
  if (sms.provider === 'playmobile' && sms.playmobile !== undefined) {
    return new PlaymobileSmsProvider(sms.playmobile, logger);
  }

  return new ConsoleSmsProvider(logger);
}
