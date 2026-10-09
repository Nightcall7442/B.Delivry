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

export const PHONE_MASK = '[phone]';
export const TOKEN_MASK = '[token]';

export function scrubText(text: string): string {
  return text.replace(TOKEN, TOKEN_MASK).replace(PHONE, PHONE_MASK);
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
