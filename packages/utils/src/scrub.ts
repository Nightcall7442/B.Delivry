/**
 * What must not leave the browser in an error report.
 *
 * A report is read by whoever has access to Sentry, for as long as Sentry keeps it. The storefront
 * handles phone numbers (sign-in, the courier's call) and sessions, and both turn up in places
 * nobody put them on purpose: an exception message built from a request, a URL with a query, a
 * breadcrumb. So every string in an event passes through here before it is sent.
 */

/** +998 90 123 45 67, 998901234567, +998(90)123-45-67: the way people and our own formatter write it. */
const PHONE = /\+?998[\s\-()]*\d{2}[\s\-()]*\d{3}[\s\-()]*\d{2}[\s\-()]*\d{2}/g;
/** A JSON web token: ours (the session) or anyone's. Three base64url parts, the first starts `eyJ`. */
const TOKEN = /eyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{8,}/g;

/** A Telegram bot token inside a URL (`/bot123456789:AAE…/sendMessage`): whoever holds it IS the bot. */
const BOT_TOKEN = /\bbot\d{6,}:[\w-]{30,}/g;
/** `scheme://user:password@host`: a database or broker address in an exception message. */
const URL_CREDENTIALS = /([a-z][a-z0-9+.-]*:\/\/)[^\s/:@]+:[^\s/@]+@/gi;

export const PHONE_MASK = '[phone]';
export const TOKEN_MASK = '[token]';
export const CREDENTIALS_MASK = '[credentials]';

export function scrubText(text: string): string {
  return text
    .replace(TOKEN, TOKEN_MASK)
    .replace(BOT_TOKEN, `bot${TOKEN_MASK}`)
    .replace(URL_CREDENTIALS, `$1${CREDENTIALS_MASK}@`)
    .replace(PHONE, PHONE_MASK);
}

/** `/orders/42?phone=…#x` → `/orders/42`: an address may name a page, never what was typed into it. */
export const withoutQuery = (url: string): string => url.replace(/[?#][\s\S]*$/, '');

/** The only request headers worth keeping in a report: which browser and language failed. */
const KEPT_HEADERS = new Set(['user-agent', 'accept-language']);

/** The part of a Sentry event that describes the request, structurally (so no SDK type is needed). */
interface EventWithRequest {
  request?: {
    url?: string;
    headers?: Record<string, string>;
    cookies?: unknown;
    data?: unknown;
    query_string?: unknown;
    env?: unknown;
  };
  breadcrumbs?: { data?: Record<string, unknown> }[];
}

/**
 * Takes the private parts off the request of an event, in place: cookies, body, query string and
 * environment go; of the headers only the browser and language stay (a proxy adds client
 * addresses and keys under names nobody lists, so the rule is an allow-list, not a deny-list); the
 * URL loses its query and fragment. The trail of fetches and navigations loses theirs too.
 */
export function stripRequest(event: EventWithRequest): void {
  const { request } = event;
  if (request) {
    if (request.url) request.url = withoutQuery(request.url);
    delete request.query_string;
    delete request.cookies;
    delete request.data;
    delete request.env;
    if (request.headers) {
      const kept: Record<string, string> = {};
      for (const [name, value] of Object.entries(request.headers)) {
        if (KEPT_HEADERS.has(name.toLowerCase())) kept[name] = value;
      }
      request.headers = kept;
    }
  }
  // fetch/xhr carry `url` (and the SDK's `http.query` / `http.fragment`), a navigation `from` and `to`.
  for (const { data } of event.breadcrumbs ?? []) {
    if (!data) continue;
    delete data['http.query'];
    delete data['http.fragment'];
    for (const key of ['url', 'from', 'to']) {
      const value = data[key];
      if (typeof value === 'string') data[key] = withoutQuery(value);
    }
  }
}

/** An event is a tree a few levels deep; anything deeper is not ours to walk. */
const MAX_DEPTH = 12;

/**
 * Masks every string in `value`, in place (a copy of an event is a copy of its stack frames —
 * and this runs on the phone). Cycles are skipped, not followed.
 */
export function scrubDeep<T>(value: T, seen: WeakSet<object> = new WeakSet(), depth = 0): T {
  if (typeof value === 'string') return scrubText(value) as T;
  if (value === null || typeof value !== 'object' || depth > MAX_DEPTH) return value;
  if (seen.has(value)) return value;
  seen.add(value);
  const holder = value as Record<string, unknown>;
  for (const key of Object.keys(holder)) {
    const inner = holder[key];
    if (typeof inner === 'string') holder[key] = scrubText(inner);
    else if (inner !== null && typeof inner === 'object') scrubDeep(inner, seen, depth + 1);
  }
  return value;
}
