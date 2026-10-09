import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const DSN = 'https://abc@o1.ingest.sentry.io/2';

const sdk = vi.hoisted(() => ({
  init: vi.fn(),
  captureException: vi.fn(),
  imported: vi.fn(),
}));

// The factory runs when the module is first imported: that is what «loaded lazily» is measured by.
vi.mock('@sentry/nextjs', () => {
  sdk.imported();
  return { init: sdk.init, captureException: sdk.captureException };
});

/** A fresh copy of the module: its page-lifetime counters start from zero. */
async function fresh() {
  vi.resetModules();
  return import('./client');
}

/** For «nothing happened»: long enough for the lazy imports to have finished, had they been asked. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 60));

// Every test starts its own copy of the module and its own listeners; on the one shared window the
// last test's would still be there to answer the next one's events.
const added: Array<[string, EventListenerOrEventListenerObject]> = [];
const realAdd = window.addEventListener.bind(window);

beforeEach(() => {
  vi.spyOn(window, 'addEventListener').mockImplementation((type, listener, options) => {
    added.push([type, listener as EventListenerOrEventListenerObject]);
    realAdd(type, listener as EventListenerOrEventListenerObject, options);
  });
  vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', DSN);
  sdk.init.mockClear();
  sdk.captureException.mockClear();
  sdk.imported.mockClear();
});
afterEach(() => {
  vi.restoreAllMocks();
  for (const [type, listener] of added.splice(0)) window.removeEventListener(type, listener);
  vi.unstubAllEnvs();
});

describe('without a DSN', () => {
  it('loads nothing, listens to nothing, sends nothing', async () => {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', '');
    const { reportError, watchGlobalErrors } = await fresh();
    watchGlobalErrors();
    reportError(new Error('boom'));
    await settle();
    expect(added).toHaveLength(0);
    expect(sdk.imported).not.toHaveBeenCalled();
    expect(sdk.captureException).not.toHaveBeenCalled();
  });
});

describe('with a DSN', () => {
  it('does not fetch the SDK until the first error', async () => {
    const { watchGlobalErrors } = await fresh();
    watchGlobalErrors();
    await settle();
    expect(sdk.imported).not.toHaveBeenCalled();
  });

  it('starts the SDK once, and hands it every error', async () => {
    const { reportError } = await fresh();
    const first = new Error('one');
    const second = new Error('two');
    reportError(first);
    reportError(second);
    await vi.waitFor(() => expect(sdk.captureException).toHaveBeenCalledTimes(2));
    expect(sdk.init).toHaveBeenCalledTimes(1);
    expect(sdk.captureException.mock.calls.map(([error]) => error)).toEqual([first, second]);
  });

  it('starts it without private data and without a second set of error sources', async () => {
    const { reportError } = await fresh();
    reportError(new Error('x'));
    await vi.waitFor(() => expect(sdk.init).toHaveBeenCalled());
    const options = sdk.init.mock.calls[0]?.[0];
    expect(options).toMatchObject({ dsn: DSN, sendDefaultPii: false });
    expect(typeof options.beforeSend).toBe('function');
    // Our two listeners are the only source: the SDK's own would report each error twice, past the
    // limit, and its session pings would count only the pages that failed.
    const names = [
      'GlobalHandlers',
      'BrowserApiErrors',
      'BrowserSession',
      'Dedupe',
      'LinkedErrors',
    ];
    const kept = options.integrations(names.map((name) => ({ name })));
    expect(kept.map((item: { name: string }) => item.name)).toEqual(['Dedupe', 'LinkedErrors']);
    // Tracing and replay are not asked for.
    expect(options).not.toHaveProperty('tracesSampleRate');
    expect(options).not.toHaveProperty('replaysSessionSampleRate');
  });

  it('reports an uncaught error and an unhandled rejection, and skips «Script error.»', async () => {
    const { watchGlobalErrors } = await fresh();
    watchGlobalErrors();
    const thrown = new TypeError('x is undefined');
    window.dispatchEvent(new ErrorEvent('error', { error: thrown, message: 'x is undefined' }));
    window.dispatchEvent(new ErrorEvent('error', { message: 'Script error.' }));
    const rejected = new Error('nobody caught this');
    window.dispatchEvent(Object.assign(new Event('unhandledrejection'), { reason: rejected }));
    await vi.waitFor(() => expect(sdk.captureException).toHaveBeenCalledTimes(2));
    await settle();
    expect(sdk.captureException.mock.calls.map(([error]) => error)).toEqual([thrown, rejected]);
  });

  it('lets ten events leave a page, whatever the SDK catches on its own', async () => {
    const { reportError } = await fresh();
    reportError(new Error('start it'));
    await vi.waitFor(() => expect(sdk.init).toHaveBeenCalled());
    const options = sdk.init.mock.calls[0]?.[0] as {
      beforeSend: (event: unknown, hint: unknown) => unknown;
    };
    const { beforeSend } = options;
    const event = () => ({ exception: { values: [{ type: 'Error', value: 'x' }] } });
    // The API's 4xx answers are dropped before they are counted: they cost none of the ten.
    const expected = Object.assign(new Error('nope'), { name: 'ApiError', status: 404 });
    for (let i = 0; i < 5; i += 1)
      expect(beforeSend(event(), { originalException: expected })).toBeNull();
    const outcomes = Array.from({ length: 14 }, () =>
      beforeSend(event(), { originalException: new TypeError('x') }),
    );
    expect(outcomes.filter((item) => item !== null)).toHaveLength(10);
    expect(outcomes.slice(10).every((item) => item === null)).toBe(true);
  });

  it('does not queue more than fifty asks behind a script that has not arrived', async () => {
    const { reportError } = await fresh();
    for (let i = 0; i < 80; i += 1) reportError(new Error(`loop ${i}`));
    await vi.waitFor(() => expect(sdk.captureException).toHaveBeenCalledTimes(50));
    await settle();
    expect(sdk.captureException).toHaveBeenCalledTimes(50);
  });
});
