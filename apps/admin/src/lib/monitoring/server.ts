/** Node side of the desk: render errors of server components and route handlers. */
import { captureRequestError, httpIntegration, init } from '@sentry/nextjs';

import { sharedOptions } from './options';

export { captureRequestError };

/**
 * Replaced or left out, so that only errors leave the server:
 * - `ProcessSession` reports one «session» for the whole life of the process, and a crashed one
 *   along with the first unhandled error: release health, not an error.
 * - `Http` is Next.js's SDK setup (Next traces its own requests) minus the default of counting every
 *   incoming request as a session.
 */
const REPLACED = new Set(['ProcessSession', 'Http']);

export function startServerMonitoring(): void {
  init({
    ...sharedOptions(),
    integrations: (defaults) => [
      ...defaults.filter((item) => !REPLACED.has(item.name)),
      httpIntegration({
        disableIncomingRequestSpans: true,
        trackIncomingRequestsAsSessions: false,
      }),
    ],
  });
}
