/**
 * fcm PushProvider adapter (FCM HTTP v1).
 */
import { createSign } from 'node:crypto';
import type { Logger } from '../../../infrastructure/logger/index.js';
import { providerErrors } from '../../../infrastructure/telemetry/metrics.js';
import type { PushPayload, PushProvider, PushResult } from '../push-provider.interface.js';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

export interface FcmCredentials {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

/**
 * FCM HTTP v1 needs an OAuth access token signed with the service account key.
 * The token lasts an hour and is cached until just before it expires, so a
 * burst of notifications is one token fetch rather than one per message.
 *
 * The JWT is built here rather than pulling in google-auth-library: it is a
 * signed header/claims pair and nothing more.
 */
export class FcmPushProvider implements PushProvider {
  readonly id = 'fcm';

  private token: { value: string; expiresAt: number } | null = null;

  constructor(
    private readonly credentials: FcmCredentials,
    private readonly logger: Logger,
  ) {}

  private async accessToken(): Promise<string | null> {
    // Refresh a minute early so a token cannot expire mid-flight.
    if (this.token !== null && this.token.expiresAt > Date.now() + 60_000) {
      return this.token.value;
    }

    const now = Math.floor(Date.now() / 1000);
    const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claims = base64url(
      JSON.stringify({
        iss: this.credentials.clientEmail,
        scope: SCOPE,
        aud: TOKEN_URL,
        iat: now,
        exp: now + 3600,
      }),
    );

    const signature = createSign('RSA-SHA256')
      .update(`${header}.${claims}`)
      .sign(this.credentials.privateKey)
      .toString('base64url');

    try {
      const response = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
          assertion: `${header}.${claims}.${signature}`,
        }),
      });

      if (!response.ok) {
        providerErrors.labels('fcm', 'auth').inc();
        return null;
      }

      const body = (await response.json()) as { access_token: string; expires_in: number };
      this.token = {
        value: body.access_token,
        expiresAt: Date.now() + body.expires_in * 1000,
      };
      return this.token.value;
    } catch (error) {
      providerErrors.labels('fcm', 'auth').inc();
      this.logger.error({ err: error }, 'fcm authentication failed');
      return null;
    }
  }

  async send(tokens: string[], payload: PushPayload): Promise<PushResult> {
    if (tokens.length === 0) return { sent: 0, invalidTokens: [] };

    const accessToken = await this.accessToken();
    if (accessToken === null) {
      return { sent: 0, invalidTokens: [], failureReason: 'authentication failed' };
    }

    const url = `https://fcm.googleapis.com/v1/projects/${this.credentials.projectId}/messages:send`;
    let sent = 0;
    const invalidTokens: string[] = [];

    // v1 has no batch endpoint; one request per device is the documented shape.
    for (const token of tokens) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${accessToken}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            message: {
              token,
              notification: { title: payload.title, body: payload.body },
              data: {
                ...payload.data,
                ...(payload.deepLink !== undefined ? { url: payload.deepLink } : {}),
              },
            },
          }),
        });

        if (response.ok) {
          sent += 1;
          continue;
        }

        // 404/UNREGISTERED means the app was uninstalled: retire the token.
        if (response.status === 404) invalidTokens.push(token);
        else providerErrors.labels('fcm', 'send').inc();
      } catch (error) {
        providerErrors.labels('fcm', 'send').inc();
        this.logger.warn({ err: error }, 'fcm send failed');
      }
    }

    return { sent, invalidTokens };
  }
}

const base64url = (value: string): string => Buffer.from(value).toString('base64url');
