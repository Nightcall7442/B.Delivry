/**
 * Runs in the browser before the app. With a DSN built in it starts Sentry (src/lib/monitoring);
 * without one the `if` below is `if ('')`, the bundler drops the branch and the SDK behind it, and
 * this file is empty. The SDK arrives as its own chunk a moment after the page script.
 */
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  void import('@/lib/monitoring/client')
    .then(({ startBrowserMonitoring }) => startBrowserMonitoring())
    .catch(() => undefined);
}

export {};
