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

  constructor(private readonly logger: Logger) {}

  async send(to: string, text: string): Promise<SmsResult> {
    this.logger.info({ to, text }, 'SMS (console provider)');
    return { accepted: true, externalId: randomUUID() };
  }

  async deliveryStatus(): Promise<'delivered'> {
    return 'delivered';
  }
}
