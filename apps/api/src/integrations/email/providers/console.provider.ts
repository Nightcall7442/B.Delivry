/**
 * console EmailProvider adapter (DEV ONLY): writes the message to the log.
 */
import { randomUUID } from 'node:crypto';
import type { Logger } from '../../../infrastructure/logger/index.js';
import type { EmailMessage, EmailProvider, EmailResult } from '../email-provider.interface.js';

/**
 * Email is the least used channel here (customers sign in by phone), so the
 * console provider is the sensible default until a transactional sender is
 * actually contracted.
 */
export class ConsoleEmailProvider implements EmailProvider {
  readonly id = 'console';

  constructor(private readonly logger: Logger) {}

  async send(message: EmailMessage): Promise<EmailResult> {
    this.logger.info({ to: message.to, subject: message.subject }, 'email (console provider)');
    return { accepted: true, externalId: randomUUID() };
  }
}
