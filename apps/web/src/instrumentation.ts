/**
 * Next calls `register` once when the server starts, and `onRequestError` for every error a
 * request ends in (server components, route handlers). Both do nothing without a DSN.
 *
 * The runtime check is an `if` around the import, not an early return: webpack drops a branch it
 * can prove dead, and the middleware (edge) is a redirect that must not carry the SDK.
 */
import { sentryDsn } from '@/lib/monitoring/dsn';

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startServerMonitoring } = await import('@/lib/monitoring/server');
    startServerMonitoring();
  }
}

export async function onRequestError(
  ...args: Parameters<typeof import('@sentry/nextjs').captureRequestError>
): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs' && sentryDsn()) {
    const { captureRequestError } = await import('@sentry/nextjs');
    captureRequestError(...args);
  }
}
