import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const DSN = 'https://abc@o1.ingest.de.sentry.io/2';

const sdk = vi.hoisted(() => ({
  imported: vi.fn(),
  init: vi.fn(),
  captureException: vi.fn(),
  breadcrumbsIntegration: vi.fn((options: unknown) => ({ name: 'Breadcrumbs', options })),
}));

// The factory runs when the module is first imported: that is what «nothing is imported» is
// measured by.
vi.mock('@sentry/nextjs', () => {
  sdk.imported();
  return {
    init: sdk.init,
    captureException: sdk.captureException,
    breadcrumbsIntegration: sdk.breadcrumbsIntegration,
  };
});

/** For «nothing happened»: long enough for the lazy imports to have finished, had they been asked. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 80));

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', DSN);
  sdk.imported.mockClear();
  sdk.init.mockClear();
  sdk.captureException.mockClear();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('without a DSN', () => {
  beforeEach(() => vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', ''));

  it('the browser entry imports nothing and starts nothing', async () => {
    await import('./instrumentation-client');
    await settle();
    expect(sdk.imported).not.toHaveBeenCalled();
    expect(sdk.init).not.toHaveBeenCalled();
  });

  it('an error boundary has nowhere to send an error to, and loads nothing to find out', async () => {
    const { reportError } = await import('@/lib/monitoring/report');
    reportError(new Error('boom'));
    await settle();
    expect(sdk.imported).not.toHaveBeenCalled();
    expect(sdk.captureException).not.toHaveBeenCalled();
  });

  it('a variable that is not set at all is the same as an empty one', async () => {
    vi.unstubAllEnvs();
    delete process.env['NEXT_PUBLIC_SENTRY_DSN'];
    await import('./instrumentation-client');
    const { reportError } = await import('@/lib/monitoring/report');
    reportError(new Error('boom'));
    await settle();
    expect(sdk.imported).not.toHaveBeenCalled();
  });
});

describe('with a DSN', () => {
  it('the browser entry starts the SDK once, with that DSN', async () => {
    await import('./instrumentation-client');
    await vi.waitFor(() => expect(sdk.init).toHaveBeenCalledTimes(1));
    expect(sdk.init.mock.calls[0]?.[0]).toMatchObject({ dsn: DSN, sendDefaultPii: false });
  });

  it('an error boundary hands the error to the SDK', async () => {
    const { reportError } = await import('@/lib/monitoring/report');
    const error = new Error('boom');
    reportError(error);
    await vi.waitFor(() => expect(sdk.captureException).toHaveBeenCalledTimes(1));
    expect(sdk.captureException.mock.calls[0]?.[0]).toBe(error);
  });
});
