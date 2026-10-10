/**
 * The one place the browser bundle takes Sentry from, by name. A dynamic `import('@sentry/nextjs')`
 * returns the whole package (session replay, feedback, tracing…) and the bundler must keep all of it;
 * importing by name lets it drop what is never called, which is most of it. Reached only through
 * `client.ts` and `report.ts`, and those only when a DSN was built in.
 */
export { breadcrumbsIntegration, captureException, init } from '@sentry/nextjs';
