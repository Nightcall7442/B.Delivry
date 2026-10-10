/**
 * One variable turns Sentry on: NEXT_PUBLIC_SENTRY_DSN. Without it nothing is initialised, nothing
 * is loaded and nothing is sent: the desk, a CI run and a developer's laptop run exactly as before.
 * Read where it is used, not at import: Next inlines the literal at build time.
 *
 * Note the places that START the SDK (`instrumentation*.ts`, `report.ts`) test
 * `process.env.NEXT_PUBLIC_SENTRY_DSN` directly instead of calling this: with no DSN the bundler
 * sees `if ('')` and removes the branch, and the SDK chunk behind it, from the build altogether.
 * A function call is opaque to it. The two must keep meaning the same thing.
 */
export const sentryDsn = (): string => process.env['NEXT_PUBLIC_SENTRY_DSN'] ?? '';

export const sentryEnvironment = (): string =>
  process.env['NEXT_PUBLIC_SENTRY_ENVIRONMENT'] ||
  (process.env.NODE_ENV === 'production' ? 'production' : 'development');
