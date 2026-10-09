/** Node side of the storefront: render errors of server components and route handlers. */
import * as Sentry from '@sentry/nextjs';

import { sentryDsn } from './dsn';
import { sharedOptions } from './options';

export function startServerMonitoring(): void {
  if (!sentryDsn()) return;
  // Errors only: tracing is cut out of the build (next.config.ts), and costs every request.
  Sentry.init(sharedOptions());
}
