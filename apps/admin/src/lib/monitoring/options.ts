/** What the browser and the Node server share when they start Sentry. */
import { sentryDsn, sentryEnvironment } from './dsn';
import { beforeSend } from './filter';

/**
 * Errors only: no `tracesSampleRate`, no replay (and `next.config.ts` cuts both out of the
 * bundle). The release is the SDK's own: the build stamps it (commit sha, or SENTRY_RELEASE).
 */
export function sharedOptions() {
  return {
    dsn: sentryDsn(),
    environment: sentryEnvironment(),
    // IPs and cookies stay with us; filter.ts covers what is left in the text.
    sendDefaultPii: false,
    beforeSend,
  } as const;
}
