/**
 * EmailProvider factory.
 */
import type { NotificationsConfig } from '../../config/index.js';
import type { Logger } from '../../infrastructure/logger/index.js';
import { ConsoleEmailProvider } from './providers/console.provider.js';
import { SmtpEmailProvider } from './providers/smtp.provider.js';
import type { EmailProvider } from './email-provider.interface.js';

export * from './email-provider.interface.js';

export function createEmailProvider(config: NotificationsConfig, logger: Logger): EmailProvider {
  const email = config.email;

  if (email.provider === 'smtp' && email.smtp !== undefined) {
    return new SmtpEmailProvider({ ...email.smtp, from: email.from }, logger);
  }

  return new ConsoleEmailProvider(logger);
}
