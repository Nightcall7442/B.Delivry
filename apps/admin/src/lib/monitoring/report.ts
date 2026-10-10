/**
 * For the places that catch an error and have no other way to say it: the error boundaries.
 * The SDK was started by `instrumentation-client.ts`; this asks it, by name and from its own
 * chunk, to take the error. Without a DSN the branch is removed from the build (see dsn.ts).
 */
export function reportError(error: unknown): void {
  if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
    // A chunk that did not arrive (the connection is down) is nothing to report with.
    void import('./sdk').then(
      ({ captureException }) => captureException(error),
      () => undefined,
    );
  }
}
