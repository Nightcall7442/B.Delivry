/** Endpoint functions for /notifications — the bits the storefront needs. */
import type { Http } from '../client.js';

export const notificationsApi = (http: Http) => ({
  /** One-shot t.me link that binds the caller's account to a Telegram chat. */
  telegramLink: () => http.request<{ url: string }>('POST', '/notifications/telegram-link'),
});
