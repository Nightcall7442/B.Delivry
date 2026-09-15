/**
 * expo PushProvider adapter (Expo push service).
 */
import { chunk } from '@bazar/utils';
import type { Logger } from '../../../infrastructure/logger/index.js';
import { providerErrors } from '../../../infrastructure/telemetry/metrics.js';
import type { PushPayload, PushProvider, PushResult } from '../push-provider.interface.js';

const ENDPOINT = 'https://exp.host/--/api/v2/push/send';

/** Expo accepts at most 100 messages per request. */
const BATCH_SIZE = 100;

interface ExpoTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

/**
 * The courier and customer apps are Expo, so this is the default. Expo returns
 * one ticket per message; a DeviceNotRegistered ticket is how a token gets
 * retired, and skipping that check is how a dead-token list grows forever.
 */
export class ExpoPushProvider implements PushProvider {
  readonly id = 'expo';

  constructor(
    private readonly logger: Logger,
    private readonly accessToken?: string,
  ) {}

  async send(tokens: string[], payload: PushPayload): Promise<PushResult> {
    if (tokens.length === 0) return { sent: 0, invalidTokens: [] };

    let sent = 0;
    const invalidTokens: string[] = [];

    for (const batch of chunk(tokens, BATCH_SIZE)) {
      const messages = batch.map((token) => ({
        to: token,
        title: payload.title,
        body: payload.body,
        sound: 'default',
        ...(payload.imageUrl !== undefined ? { richContent: { image: payload.imageUrl } } : {}),
        data: {
          ...payload.data,
          ...(payload.deepLink !== undefined ? { url: payload.deepLink } : {}),
        },
      }));

      try {
        const response = await fetch(ENDPOINT, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            accept: 'application/json',
            ...(this.accessToken !== undefined
              ? { authorization: `Bearer ${this.accessToken}` }
              : {}),
          },
          body: JSON.stringify(messages),
        });

        if (!response.ok) {
          providerErrors.labels('expo', 'send').inc();
          continue;
        }

        const body = (await response.json()) as { data?: ExpoTicket[] };

        // Tickets come back in request order, which is what maps a rejection
        // back to the token that caused it.
        (body.data ?? []).forEach((ticket, index) => {
          if (ticket.status === 'ok') {
            sent += 1;
            return;
          }
          if (ticket.details?.error === 'DeviceNotRegistered') {
            const token = batch[index];
            if (token !== undefined) invalidTokens.push(token);
          }
        });
      } catch (error) {
        providerErrors.labels('expo', 'send').inc();
        this.logger.warn({ err: error }, 'expo push failed');
      }
    }

    return { sent, invalidTokens };
  }
}
