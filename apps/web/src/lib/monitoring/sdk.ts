/**
 * The one place the browser bundle takes Sentry from — by name, and only these two. A dynamic
 * `import('@sentry/nextjs')` returns the whole package (session replay, feedback, tracing…) and the
 * bundler must keep all of it; importing by name lets it drop what is never called, which is most
 * of it. `client.ts` imports this file lazily.
 */
export { init, captureException } from '@sentry/nextjs';
