/**
 * playmobile SmsProvider adapter (send.smsxabar.uz).
 */
import { randomUUID } from 'node:crypto';
import type { Logger } from '../../../infrastructure/logger/index.js';
import { providerErrors } from '../../../infrastructure/telemetry/metrics.js';
import type { SmsProvider, SmsResult } from '../sms-provider.interface.js';

const BASE = 'http://91.204.239.44/broker-api';

/**
 * Playmobile uses basic auth and a batch envelope, with no synchronous status:
 * delivery reports arrive later on the webhook endpoint, matched by the
 * message-id we generate here.
 */
export class PlaymobileSmsProvider implements SmsProvider {
  readonly id = 'playmobile';

  constructor(
    private readonly credentials: { login: string; password: string },
    private readonly logger: Logger,
  ) {}

  private authHeader(): string {
    const encoded = Buffer.from(`${this.credentials.login}:${this.credentials.password}`).toString(
      'base64',
    );
    return `Basic ${encoded}`;
  }

  async send(to: string, text: string): Promise<SmsResult> {
    // We choose the id, which is what lets an async delivery report be matched.
    const messageId = randomUUID();

    try {
      const response = await fetch(`${BASE}/send`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: this.authHeader() },
        body: JSON.stringify({
          messages: [
            {
              recipient: to.replace('+', ''),
              'message-id': messageId,
              sms: { originator: '3700', content: { text } },
            },
          ],
        }),
      });

      if (!response.ok) {
        providerErrors.labels('playmobile', 'send').inc();
        return { accepted: false, externalId: null, failureReason: `HTTP ${response.status}` };
      }

      return { accepted: true, externalId: messageId };
    } catch (error) {
      providerErrors.labels('playmobile', 'send').inc();
      this.logger.error({ err: error }, 'playmobile send failed');
      return { accepted: false, externalId: null, failureReason: 'request failed' };
    }
  }

  async deliveryStatus(): Promise<'unknown'> {
    // Reports are pushed to /webhooks/sms/playmobile, never polled.
    return 'unknown';
  }
}
