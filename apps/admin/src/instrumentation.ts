/**
 * Next calls `register` once when the server starts, and `onRequestError` for every error a
 * request ends in (server components, route handlers). Both do nothing without a DSN.
 *
 * The DSN is tested right here, not in a helper: without one the bundler sees `if ('')` and drops
 * the branch and the SDK behind it from the build, so the server image is the one it was before.
 * The runtime check is the same kind of `if`: it keeps the SDK out of the edge bundle.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.NEXT_PUBLIC_SENTRY_DSN) {
    const { startServerMonitoring } = await import('@/lib/monitoring/server');
    startServerMonitoring();
  }
}

export async function onRequestError(
  ...args: Parameters<typeof import('@sentry/nextjs').captureRequestError>
): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.NEXT_PUBLIC_SENTRY_DSN) {
    const { captureRequestError } = await import('@/lib/monitoring/server');
    captureRequestError(...args);
  }
}
