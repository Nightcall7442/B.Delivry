/**
 * console SmsProvider adapter (DEV ONLY): writes the message to the log.
 */
import { randomUUID } from 'node:crypto';
import type { Logger } from '../../../infrastructure/logger/index.js';
import type { SmsProvider, SmsResult } from '../sms-provider.interface.js';

/**
 * The default in development, and the reason a developer can run the whole OTP
 * flow without an SMS contract: the code appears in the log instead of a phone.
 *
 * The env schema refuses to select this in production.
 */
export class ConsoleSmsProvider implements SmsProvider {
  readonly id = 'console';

  /** The last messages, newest first, for the GET /dev/sms page. */
  static readonly recent: Array<{ to: string; text: string; at: Date }> = [];

  constructor(private readonly logger: Logger) {}

  async send(to: string, text: string): Promise<SmsResult> {
    this.logger.info({ to, text }, 'SMS (console provider)');
    ConsoleSmsProvider.recent.unshift({ to, text, at: new Date() });
    ConsoleSmsProvider.recent.splice(50);
    return { accepted: true, externalId: randomUUID() };
  }

  async deliveryStatus(): Promise<'delivered'> {
    return 'delivered';
  }
}
