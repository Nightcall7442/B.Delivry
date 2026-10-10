import { ApiError } from '@bazar/api-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const DSN = 'https://abc@o1.ingest.de.sentry.io/2';

const sdk = vi.hoisted(() => ({
  init: vi.fn(),
  captureException: vi.fn(),
  breadcrumbsIntegration: vi.fn((options: unknown) => ({ name: 'Breadcrumbs', options })),
}));

vi.mock('@sentry/nextjs', () => sdk);

/** A fresh copy of the module: its page-lifetime counter starts from zero. */
async function fresh() {
  vi.resetModules();
  return import('./client');
}

/** What `init` was last given. */
const options = () =>
  sdk.init.mock.calls.at(-1)?.[0] as {
    dsn: string;
    environment: string;
    sendDefaultPii: boolean;
    sendClientReports: boolean;
    beforeSend: (event: unknown, hint?: unknown) => unknown;
    integrations: (defaults: Array<{ name: string }>) => Array<{ name: string; options?: unknown }>;
  };

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', DSN);
  sdk.init.mockClear();
  sdk.captureException.mockClear();
  sdk.breadcrumbsIntegration.mockClear();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('startBrowserMonitoring', () => {
  it('starts the SDK once, with the DSN, the environment and no private data', async () => {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_ENVIRONMENT', 'staging');
    const { startBrowserMonitoring } = await fresh();
    startBrowserMonitoring();
    expect(sdk.init).toHaveBeenCalledTimes(1);
    expect(options()).toMatchObject({ dsn: DSN, environment: 'staging', sendDefaultPii: false });
    expect(typeof options().beforeSend).toBe('function');
  });

  it('asks for errors and nothing else: no tracing, no replay, no profiling, no logs, no pings', async () => {
    const { startBrowserMonitoring } = await fresh();
    startBrowserMonitoring();
    const given = options() as unknown as Record<string, unknown>;
    for (const key of [
      'tracesSampleRate',
      'tracesSampler',
      'replaysSessionSampleRate',
      'replaysOnErrorSampleRate',
      'profilesSampleRate',
      'enableLogs',
      'tunnel',
    ])
      expect(given).not.toHaveProperty(key);
    // «N events were dropped» notes would be one more thing leaving the page for an error we skipped.
    expect(options().sendClientReports).toBe(false);
  });

  it('keeps the SDK’s own listeners and drops what pings Sentry or records the page', async () => {
    const { startBrowserMonitoring } = await fresh();
    startBrowserMonitoring();
    const names = [
      'InboundFilters',
      'FunctionToString',
      'BrowserApiErrors',
      'Breadcrumbs',
      'GlobalHandlers',
      'LinkedErrors',
      'Dedupe',
      'HttpContext',
      'BrowserSession',
    ];
    const kept = options().integrations(names.map((name) => ({ name })));
    const keptNames = kept.map((item) => item.name);
    // Uncaught errors and rejections are the SDK's own job here; sessions are not wanted.
    expect(keptNames).toContain('GlobalHandlers');
    expect(keptNames).toContain('BrowserApiErrors');
    expect(keptNames).not.toContain('BrowserSession');
    // One Breadcrumbs, and it is ours, put last.
    expect(keptNames.filter((name) => name === 'Breadcrumbs')).toHaveLength(1);
    expect(keptNames.at(-1)).toBe('Breadcrumbs');
  });

  it('records requests and navigations but not clicks or console output', async () => {
    const { startBrowserMonitoring } = await fresh();
    startBrowserMonitoring();
    options().integrations([{ name: 'Breadcrumbs' }]);
    expect(sdk.breadcrumbsIntegration).toHaveBeenCalledWith({ dom: false, console: false });
  });

  it('sends our own errors with the service tag, and masks a phone in them', async () => {
    const { startBrowserMonitoring } = await fresh();
    startBrowserMonitoring();
    const event = { exception: { values: [{ type: 'Error', value: 'bad +998 90 123 45 67' }] } };
    const out = options().beforeSend(event, { originalException: new TypeError('x') }) as {
      tags: Record<string, string>;
      exception: { values: Array<{ value: string }> };
    };
    expect(out.tags).toEqual({ service: 'admin' });
    expect(out.exception.values[0]?.value).toBe('bad [phone]');
  });

  it('does not report an API 4xx, and tags a 5xx with the request id', async () => {
    const { startBrowserMonitoring } = await fresh();
    startBrowserMonitoring();
    const event = () => ({ exception: { values: [{ type: 'Error', value: 'x' }] } });
    const expected = new ApiError(404, { code: 'NOT_FOUND', message: 'nope' });
    expect(options().beforeSend(event(), { originalException: expected })).toBeNull();
    const down = new ApiError(500, { code: 'INTERNAL', message: 'x', requestId: 'req-7' });
    const out = options().beforeSend(event(), { originalException: down }) as {
      tags: Record<string, string>;
    };
    expect(out.tags).toMatchObject({ service: 'admin', 'api.request_id': 'req-7' });
  });

  it('lets ten events leave a page, whatever the SDK catches', async () => {
    const { startBrowserMonitoring } = await fresh();
    startBrowserMonitoring();
    const { beforeSend } = options();
    const event = () => ({ exception: { values: [{ type: 'Error', value: 'x' }] } });
    // The API's 4xx answers are dropped before they are counted: they cost none of the ten.
    const expected = new ApiError(404, { code: 'NOT_FOUND', message: 'nope' });
    for (let i = 0; i < 5; i += 1)
      expect(beforeSend(event(), { originalException: expected })).toBeNull();
    const outcomes = Array.from({ length: 14 }, () =>
      beforeSend(event(), { originalException: new TypeError('x') }),
    );
    expect(outcomes.filter((item) => item !== null)).toHaveLength(10);
    expect(outcomes.slice(10).every((item) => item === null)).toBe(true);
  });
});
