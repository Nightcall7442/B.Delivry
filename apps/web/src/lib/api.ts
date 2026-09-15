/**
 * The API client, two ways.
 *
 * In the browser: one shared instance whose tokens live in localStorage, so a
 * reload keeps the session and every component talks through the same refresh
 * flow. On the server (RSC pages): a fresh anonymous instance per call — public
 * lists only, no tokens, nothing shared between requests.
 */
import { createApiClient, type ApiClient, type Tokens } from '@bazar/api-client';

const TOKENS_KEY = 'bazar.tokens';
const BASE_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:4000/api/v1';

function readTokens(): Tokens | null {
  try {
    const raw = window.localStorage.getItem(TOKENS_KEY);
    return raw ? (JSON.parse(raw) as Tokens) : null;
  } catch {
    return null;
  }
}

export const browserTokens = {
  get: readTokens,
  set(tokens: Tokens | null) {
    try {
      if (tokens) window.localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens));
      else window.localStorage.removeItem(TOKENS_KEY);
    } catch {
      // Private mode: the session lasts for this page only.
    }
    signedOutListeners.forEach((listener) => tokens === null && listener());
  },
};

const signedOutListeners = new Set<() => void>();
/** The auth store subscribes here so a failed refresh anywhere logs the UI out. */
export const onSignedOut = (listener: () => void): (() => void) => {
  signedOutListeners.add(listener);
  return () => signedOutListeners.delete(listener);
};

let browser: ApiClient | null = null;

/** Locale comes from the cookie the middleware maintains, so every request matches the page. */
const cookieLocale = (): string => document.cookie.match(/(?:^|; )locale=([a-z]{2})/)?.[1] ?? 'ru';

export function api(): ApiClient {
  if (typeof window === 'undefined') return serverApi();
  browser ??= createApiClient({
    baseUrl: BASE_URL,
    tokens: browserTokens,
    locale: cookieLocale,
    // White-label: the layout stamps the tenant it resolved from the host.
    ...(document.documentElement.dataset['tenant']
      ? { tenant: document.documentElement.dataset['tenant'] }
      : {}),
    onSignedOut: () => signedOutListeners.forEach((listener) => listener()),
  });
  return browser;
}

export function serverApi(locale = 'ru'): ApiClient {
  return createApiClient({
    baseUrl: process.env['API_URL'] ?? BASE_URL,
    tokens: { get: () => null, set: () => undefined },
    locale: () => locale,
  });
}
