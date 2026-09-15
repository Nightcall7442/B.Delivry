/**
 * One API client for the panel. Everything here runs in the browser: the
 * dispatcher is a signed-in operator, and nothing is public.
 */
import { createApiClient, type ApiClient, type Tokens } from '@bazar/api-client';

const TOKENS_KEY = 'bazar.admin.tokens';
const BASE_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:4000/api/v1';

const signedOutListeners = new Set<() => void>();

export const browserTokens = {
  get(): Tokens | null {
    try {
      const raw = window.localStorage.getItem(TOKENS_KEY);
      return raw ? (JSON.parse(raw) as Tokens) : null;
    } catch {
      return null;
    }
  },
  set(tokens: Tokens | null) {
    try {
      if (tokens) window.localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens));
      else window.localStorage.removeItem(TOKENS_KEY);
    } catch {
      // Session lasts for this page only.
    }
  },
};

/** A failed refresh anywhere logs the panel out. */
export const onSignedOut = (listener: () => void): (() => void) => {
  signedOutListeners.add(listener);
  return () => signedOutListeners.delete(listener);
};

let client: ApiClient | null = null;

export function api(): ApiClient {
  client ??= createApiClient({
    baseUrl: BASE_URL,
    tokens: browserTokens,
    locale: () => 'ru',
    onSignedOut: () => signedOutListeners.forEach((listener) => listener()),
  });
  return client;
}
