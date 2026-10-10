/**
 * What an error report may carry out of the API.
 *
 * A report is read by whoever has access to Sentry, for as long as Sentry keeps it. The API sees
 * phone numbers (sign-in, the courier's call), session tokens and the whole of every request, and
 * none of that belongs in an issue tracker. So the event is cut down to what finds the failure
 * (message, stack, the tags the caller set) and every string left in it is masked.
 *
 * Type-only import of the SDK: this file is loaded only together with it, never without a DSN.
 */
import { scrubDeep } from '@bazar/utils/scrub';
import type { ErrorEvent } from '@sentry/node';

/** `/orders/42?token=x#top` -> `/orders/42`: what a person typed after the path is not ours to keep. */
const withoutQuery = (url: string): string => url.split(/[?#]/, 1)[0] ?? '';

/**
 * Sentry's `beforeSend`: the event that is sent, with nothing private in it. Never returns null:
 * deciding what is worth reporting is the caller's job (the error handler reports 5xx, not 4xx).
 *
 * The integrations that fill `request` are not enabled (see error-reporting.ts), so today there
 * is nothing to strip. It is stripped anyway: turning one on later must not start sending
 * headers, cookies or bodies.
 */
export function sanitizeEvent(event: ErrorEvent): ErrorEvent {
  const { request, user } = event;

  if (request !== undefined) {
    delete request.headers;
    delete request.cookies;
    delete request.data;
    delete request.query_string;
    // Holds REMOTE_ADDR: the caller's IP.
    delete request.env;
    if (typeof request.url === 'string') request.url = withoutQuery(request.url);
  }

  // An opaque id says "the same person again"; the rest says who they are.
  if (user !== undefined) {
    const id = user.id;
    if (id === undefined || id === '') delete event.user;
    else event.user = { id: String(id) };
  }

  // A thrown plain object (not an Error) is serialised whole into `extra`: a body, an address, a phone
  // in a field the text rules cannot know. Its type and message are enough to find the throw.
  if (event.extra !== undefined) delete event.extra['__serialized__'];

  // Local variables of a frame are whatever the code held at that moment: a body, a token.
  for (const exception of event.exception?.values ?? []) {
    for (const frame of exception.stacktrace?.frames ?? []) delete frame.vars;
  }

  return scrubDeep(event);
}
