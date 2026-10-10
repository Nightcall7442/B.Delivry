/**
 * Which errors are worth a report, and what a report may carry.
 *
 * A storefront on mobile data produces a steady stream of failures that are not bugs: the
 * connection dropped, a chunk did not arrive, the person's session ended. Reported, they bury the
 * ones that are. So the rule is the same one the screens already follow: what the API answered
 * with a 4xx is the person's situation (shown to them, handled); a request that never got an
 * answer is the network's. What is left — our own exceptions, and a server that answered 5xx — is
 * ours to fix.
 */
import type { ErrorEvent, EventHint } from '@sentry/nextjs';

import { scrubDeep, stripRequest } from './scrub';

/** Failures of the road, not of the page: a flaky connection loading a script, or a layout nit. */
const NOISE: readonly RegExp[] = [
  /ResizeObserver loop/i,
  /ChunkLoadError/i,
  /Loading (CSS )?chunk [\w-]+ failed/i,
  /Failed to fetch dynamically imported module/i,
  /Importing a module script failed/i,
];

interface ApiErrorLike {
  name: string;
  status: number;
  code?: string;
  requestId?: string;
}

/** `@bazar/api-client`'s ApiError, recognised by shape: the check must hold across bundles. */
const asApiError = (error: unknown): ApiErrorLike | null =>
  error instanceof Error &&
  error.name === 'ApiError' &&
  typeof (error as { status?: unknown }).status === 'number'
    ? (error as unknown as ApiErrorLike)
    : null;

/** An answer the person was already shown (4xx) or no answer at all (status 0). */
export function isExpected(error: unknown): boolean {
  const api = asApiError(error);
  return api !== null && api.status < 500;
}

const messagesOf = (event: ErrorEvent): string[] => [
  event.message ?? '',
  ...(event.exception?.values ?? []).flatMap((item) => [item.type ?? '', item.value ?? '']),
];

/** Sentry's `beforeSend`: null drops the event, otherwise it goes out with nothing private in it. */
export function beforeSend(event: ErrorEvent, hint?: EventHint): ErrorEvent | null {
  const original = hint?.originalException;
  if (isExpected(original)) return null;
  if (messagesOf(event).some((text) => NOISE.some((pattern) => pattern.test(text)))) return null;

  const api = asApiError(original);
  if (api !== null) {
    // The id the API logged the failing request under: the one thing that ties this report to it.
    event.tags = {
      ...event.tags,
      'api.status': String(api.status),
      ...(api.code ? { 'api.code': api.code } : {}),
      ...(api.requestId ? { 'api.request_id': api.requestId } : {}),
    };
  }
  // The request: no cookies, body or query, only the browser and the language; no query on any URL.
  stripRequest(event);
  return scrubDeep(event);
}
