/** Endpoint functions for /auth. */
import type {
  AuthResultDto,
  RequestOtpDto,
  RequestOtpResultDto,
  SessionDto,
  TelegramLoginStartDto,
  TelegramLoginStatusDto,
  VerifyOtpDto,
} from '@bazar/types';

import type { Http } from '../client.js';
import type { TokenStore } from '../types.js';

export const authApi = (http: Http, tokens: TokenStore) => ({
  requestOtp: (body: RequestOtpDto) =>
    http.request<RequestOtpResultDto>('POST', '/auth/otp/request', { body, auth: 'none' }),

  /** Verifies the code and stores the token pair, so the next call is signed in. */
  async verifyOtp(body: VerifyOtpDto): Promise<AuthResultDto> {
    const result = await http.request<AuthResultDto>('POST', '/auth/otp/verify', {
      body,
      auth: 'none',
    });
    await tokens.set({ accessToken: result.accessToken, refreshToken: result.refreshToken });
    return result;
  },

  /** Opens a Telegram login: the app shows `url`, then polls `telegramStatus(code)`. */
  telegramStart: () =>
    http.request<TelegramLoginStartDto>('POST', '/auth/telegram/start', { auth: 'none' }),

  /** One poll; on `done` the token pair is stored, so the next call is signed in. */
  async telegramStatus(code: string): Promise<TelegramLoginStatusDto> {
    const result = await http.request<TelegramLoginStatusDto>(
      'GET',
      `/auth/telegram/status?code=${encodeURIComponent(code)}`,
      { auth: 'none' },
    );
    if (result.status === 'done') {
      await tokens.set({ accessToken: result.accessToken, refreshToken: result.refreshToken });
    }
    return result;
  },

  async logout(): Promise<void> {
    try {
      await http.request<void>('POST', '/auth/logout');
    } finally {
      // The server session may already be gone; the device forgets either way.
      await tokens.set(null);
    }
  },

  sessions: () => http.request<SessionDto[]>('GET', '/auth/sessions'),
});
