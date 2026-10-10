/**
 * Sentry in the browser. A few operators on desktops, so the SDK starts the usual way, as the
 * page does (`instrumentation-client.ts`): with its own listeners for uncaught errors, and a trail
 * of the requests and navigations before the error. What it is told not to do is in the notes below.
 */
import { sharedOptions } from './options';
import { breadcrumbsIntegration, init } from './sdk';

/** A page stuck in a render loop would send the same failure a thousand times. */
const MAX_REPORTS_PER_PAGE = 10;

/**
 * Replaced or left out. `BrowserSession` pings Sentry on every page and route change to count
 * «sessions» — a second kind of traffic, and not an error. `Breadcrumbs` is put back below, without
 * the two sources that would write the page into a report.
 */
const REPLACED = new Set(['Breadcrumbs', 'BrowserSession']);

let sent = 0;

export function startBrowserMonitoring(): void {
  const options = sharedOptions();
  init({
    ...options,
    // «N events were dropped» notes: nothing leaves the page for an error we chose not to report.
    sendClientReports: false,
    // The limit counts what actually leaves the page: an expected error costs none of it.
    beforeSend: (event, hint) => {
      if (sent >= MAX_REPORTS_PER_PAGE) return null;
      const kept = options.beforeSend(event, hint);
      if (kept !== null) sent += 1;
      return kept;
    },
    integrations: (defaults) => [
      ...defaults.filter((item) => !REPLACED.has(item.name)),
      // `dom` records the element behind every click (its tag, class, label); `console` records
      // whatever a screen logged. The desk shows customers' phones and addresses: neither is kept.
      // Requests, navigations and Sentry's own events stay, with their query strings cut (filter.ts).
      breadcrumbsIntegration({ dom: false, console: false }),
    ],
  });
}
