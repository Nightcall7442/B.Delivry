/**
 * eskiz SmsProvider adapter (notify.eskiz.uz).
 */
import type { Logger } from '../../../infrastructure/logger/index.js';
import { providerErrors } from '../../../infrastructure/telemetry/metrics.js';
import type { SmsProvider, SmsResult } from '../sms-provider.interface.js';

const BASE = 'https://notify.eskiz.uz/api';

/**
 * Eskiz is the common Uzbek SMS gateway. It uses a bearer token that expires,
 * so the token is fetched lazily and refreshed once on a 401 rather than being
 * re-fetched before every message.
 */
export class EskizSmsProvider implements SmsProvider {
  readonly id = 'eskiz';

  private token: string | null = null;

  constructor(
    private readonly credentials: { email: string; password: string; from: string },
    private readonly logger: Logger,
  ) {}

  private async authenticate(): Promise<string | null> {
    try {
      const response = await fetch(`${BASE}/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: this.credentials.email,
          password: this.credentials.password,
        }),
      });

      if (!response.ok) {
        providerErrors.labels('eskiz', 'auth').inc();
        return null;
      }

      const body = (await response.json()) as { data?: { token?: string } };
      this.token = body.data?.token ?? null;
      return this.token;
    } catch (error) {
      providerErrors.labels('eskiz', 'auth').inc();
      this.logger.error({ err: error }, 'eskiz authentication failed');
      return null;
    }
  }

  private async post(
    path: string,
    body: Record<string, string>,
    retry = true,
  ): Promise<Response | null> {
    const token = this.token ?? (await this.authenticate());
    if (token === null) return null;

    const response = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      body: new URLSearchParams(body),
    });

    // The token expires silently; one refresh and retry covers it.
    if (response.status === 401 && retry) {
      this.token = null;
      return this.post(path, body, false);
    }

    return response;
  }

  async send(to: string, text: string): Promise<SmsResult> {
    try {
      // Eskiz wants the number without the leading plus.
      const response = await this.post('/message/sms/send', {
        mobile_phone: to.replace('+', ''),
        message: text,
        from: this.credentials.from,
      });

      if (response === null || !response.ok) {
        providerErrors.labels('eskiz', 'send').inc();
        return {
          accepted: false,
          externalId: null,
          failureReason: `HTTP ${response?.status ?? 'no response'}`,
        };
      }

      const body = (await response.json()) as { id?: string; status?: string; message?: string };
      return {
        accepted: body.status !== 'error',
        externalId: body.id ?? null,
        ...(body.status === 'error' ? { failureReason: body.message ?? 'rejected' } : {}),
      };
    } catch (error) {
      providerErrors.labels('eskiz', 'send').inc();
      this.logger.error({ err: error }, 'eskiz send failed');
      return { accepted: false, externalId: null, failureReason: 'request failed' };
    }
  }

  async deliveryStatus(externalId: string): Promise<'sent' | 'delivered' | 'failed' | 'unknown'> {
    try {
      const token = this.token ?? (await this.authenticate());
      if (token === null) return 'unknown';

      const response = await fetch(`${BASE}/message/sms/status_by_id/${externalId}`, {
        headers: { authorization: `Bearer ${token}` },
      });
      if (!response.ok) return 'unknown';

      const body = (await response.json()) as { status?: string };
      switch (body.status) {
        case 'DELIVRD':
        case 'delivered':
          return 'delivered';
        case 'REJECTD':
        case 'UNDELIV':
        case 'failed':
          return 'failed';
        case undefined:
          return 'unknown';
        default:
          return 'sent';
      }
    } catch {
      return 'unknown';
    }
  }
}
