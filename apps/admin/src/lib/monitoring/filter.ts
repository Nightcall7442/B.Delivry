/**
 * Which errors are worth a report, and what a report may carry.
 *
 * The desk is a few people on desktops, but its screens are full of other people's data: customers'
 * phones and addresses, their orders. So two rules. What is reported: the same as the storefront
 * (an answer the API gave with a 4xx is the operator's situation, shown to them and handled; a
 * request that got no answer is the network's; what is left, our own exceptions and a server that
 * answered 5xx, is ours to fix). What leaves: nothing of the page. Phone numbers and tokens are
 * masked in every string (`scrubDeep`), and addresses lose their query strings, which is where a
 * search box or a filter puts what was typed.
 */
import { scrubDeep, stripRequest, withoutQuery } from '@bazar/utils/scrub';
import type { ErrorEvent, EventHint } from '@sentry/nextjs';

/** The tag every report carries, so the three services of one Sentry organisation tell apart. */
export const SERVICE = 'admin';

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

/** Where the server side says which page failed: it may carry the query too. */
function stripPagePath(event: ErrorEvent): void {
  const nextjs = event.contexts?.['nextjs'];
  if (nextjs && typeof nextjs['request_path'] === 'string')
    nextjs['request_path'] = withoutQuery(nextjs['request_path']);
}

/** Sentry's `beforeSend`: null drops the event, otherwise it goes out with nothing private in it. */
export function beforeSend(event: ErrorEvent, hint?: EventHint): ErrorEvent | null {
  const original = hint?.originalException;
  if (isExpected(original)) return null;
  if (messagesOf(event).some((text) => NOISE.some((pattern) => pattern.test(text)))) return null;

  event.tags = { ...event.tags, service: SERVICE };
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
  stripRequest(event);
  stripPagePath(event);
  return scrubDeep(event);
}
