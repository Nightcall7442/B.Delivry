/** What the browser and the Node server share when they start Sentry. */
import { sentryDsn, sentryEnvironment } from './dsn';
import { beforeSend } from './filter';

export function sharedOptions() {
  return {
    dsn: sentryDsn(),
    environment: sentryEnvironment(),
    // Phones, IPs and cookies stay with us; scrub.ts covers what is left in the text.
    sendDefaultPii: false,
    beforeSend,
  } as const;
}
