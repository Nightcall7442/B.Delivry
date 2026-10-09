/**
 * One variable turns Sentry on: NEXT_PUBLIC_SENTRY_DSN. Without it nothing is initialised, nothing
 * is loaded and nothing is sent — a checkout, a CI run and a developer's laptop run exactly as
 * before. Read where it is used, not at import: Next inlines the literal into the browser bundle.
 *
 * Kept apart from options.ts on purpose: this is what the page needs at start (one line), that
 * is what only the error path needs (the filter, the scrubber).
 */
export const sentryDsn = (): string => process.env['NEXT_PUBLIC_SENTRY_DSN'] ?? '';

export const sentryEnvironment = (): string =>
  process.env['NEXT_PUBLIC_SENTRY_ENVIRONMENT'] ||
  (process.env.NODE_ENV === 'production' ? 'production' : 'development');
