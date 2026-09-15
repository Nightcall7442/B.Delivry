/**
 * smtp EmailProvider adapter.
 */
import type { Logger } from '../../../infrastructure/logger/index.js';
import { providerErrors } from '../../../infrastructure/telemetry/metrics.js';
import type { EmailMessage, EmailProvider, EmailResult } from '../email-provider.interface.js';

export interface SmtpSettings {
  host: string;
  port: number;
  user?: string;
  password?: string;
  from: string;
}

/**
 * SMTP needs a real client library (nodemailer), which is not a dependency
 * this API otherwise has. Rather than half-implement the protocol over a raw
 * socket, the transport is loaded dynamically: install nodemailer and this
 * provider starts working, leave it out and email degrades to the log.
 *
 * ponytail: dynamic import instead of a hard dependency, because email is the
 * least used channel here. Make it a real dependency when email matters.
 */
export class SmtpEmailProvider implements EmailProvider {
  readonly id = 'smtp';

  constructor(
    private readonly settings: SmtpSettings,
    private readonly logger: Logger,
  ) {}

  async send(message: EmailMessage): Promise<EmailResult> {
    try {
      // Loaded through a variable so TypeScript does not require nodemailer to
      // be installed; the catch below is the path when it is not.
      const specifier = 'nodemailer';
      const nodemailer = (await import(specifier)) as {
        createTransport(options: unknown): {
          sendMail(message: unknown): Promise<{ messageId?: string }>;
        };
      };

      const transport = nodemailer.createTransport({
        host: this.settings.host,
        port: this.settings.port,
        secure: this.settings.port === 465,
        ...(this.settings.user !== undefined && this.settings.password !== undefined
          ? { auth: { user: this.settings.user, pass: this.settings.password } }
          : {}),
      });

      const info = await transport.sendMail({
        from: this.settings.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        ...(message.html !== undefined ? { html: message.html } : {}),
      });

      return { accepted: true, externalId: info.messageId ?? null };
    } catch (error) {
      providerErrors.labels('smtp', 'send').inc();
      this.logger.error({ err: error, to: message.to }, 'smtp send failed');
      return { accepted: false, externalId: null, failureReason: 'smtp transport unavailable' };
    }
  }
}
