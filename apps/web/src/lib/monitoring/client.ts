/**
 * Error reports from the browser — without taking anything from the page until there is an error.
 *
 * Sentry's browser SDK is a few dozen KB of script. Started the usual way it sits in the first
 * load of every page, and on a phone on mobile data that is paid by everyone, every first visit,
 * to learn about the few who hit an error. Here the page carries two listeners; the SDK is fetched
 * (as its own chunk) the first time something actually fails, started then, and handed that error.
 * The price is the trail before the first error (clicks, navigation): there is none. If that
 * matters more than the bytes, `Sentry.init` in `instrumentation-client.ts` is the standard setup.
 */
import { sentryDsn } from './dsn';

type SentryBrowser = typeof import('./sdk');

/** A page stuck in a render loop would send the same failure a thousand times from a weak phone. */
const MAX_REPORTS_PER_PAGE = 10;
/** …and would queue a thousand closures behind a script that has not arrived yet. */
const MAX_ASKS_PER_PAGE = 50;

/**
 * What the SDK would otherwise report on its own, a second time and past the limit above: the two
 * listeners in `watchGlobalErrors` already see every uncaught error and rejection, including those
 * thrown inside timers and event handlers. And the session pings, which would count only the pages
 * that had an error — a «crash-free rate» of 0%.
 */
const OWN_SOURCES = new Set(['GlobalHandlers', 'BrowserApiErrors', 'BrowserSession']);

let sent = 0;
let asked = 0;
let loading: Promise<SentryBrowser | null> | null = null;

function load(): Promise<SentryBrowser | null> {
  loading ??= Promise.all([import('./sdk'), import('./options')])
    .then(([Sentry, { sharedOptions }]) => {
      const options = sharedOptions();
      Sentry.init({
        ...options,
        // The limit counts what actually leaves the page: an expected error costs none of it.
        beforeSend: (event, hint) => {
          if (sent >= MAX_REPORTS_PER_PAGE) return null;
          const kept = options.beforeSend(event, hint);
          if (kept !== null) sent += 1;
          return kept;
        },
        integrations: (defaults) => defaults.filter((item) => !OWN_SOURCES.has(item.name)),
      });
      return Sentry;
    })
    .catch(() => {
      // The script itself did not arrive (the connection that broke the page is still broken):
      // let the next error try again.
      loading = null;
      return null;
    });
  return loading;
}

/** For the places that catch an error and have no other way to say it (error boundaries). */
export function reportError(error: unknown): void {
  if (!sentryDsn() || asked >= MAX_ASKS_PER_PAGE) return;
  asked += 1;
  void load().then((Sentry) => Sentry?.captureException(error));
}

/** Uncaught errors and rejected promises that nobody handled. Call once, as the page starts. */
export function watchGlobalErrors(): void {
  if (!sentryDsn() || typeof window === 'undefined') return;
  // `error` is null for «Script error.» from another origin: nothing to learn from it.
  window.addEventListener('error', (event) => {
    if (event.error) reportError(event.error);
  });
  window.addEventListener('unhandledrejection', (event) => reportError(event.reason));
}
