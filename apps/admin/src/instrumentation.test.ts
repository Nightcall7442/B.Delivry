import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const DSN = 'https://abc@o1.ingest.de.sentry.io/2';

const sdk = vi.hoisted(() => ({
  imported: vi.fn(),
  init: vi.fn(),
  captureRequestError: vi.fn(),
  httpIntegration: vi.fn((options: unknown) => ({ name: 'Http', options })),
}));

// The factory runs when the module is first imported: that is what «nothing is imported» is
// measured by.
vi.mock('@sentry/nextjs', () => {
  sdk.imported();
  return {
    init: sdk.init,
    captureRequestError: sdk.captureRequestError,
    httpIntegration: sdk.httpIntegration,
  };
});

/** What Next hands `onRequestError`. */
const request = { path: '/orders/42', method: 'GET', headers: {} };
const context = {
  routerKind: 'App Router',
  routePath: '/orders/[orderId]',
  routeType: 'render',
  renderSource: 'react-server-components',
  revalidateReason: undefined,
} as const;

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', DSN);
  vi.stubEnv('NEXT_RUNTIME', 'nodejs');
  sdk.imported.mockClear();
  sdk.init.mockClear();
  sdk.captureRequestError.mockClear();
  sdk.httpIntegration.mockClear();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('without a DSN', () => {
  beforeEach(() => vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', ''));

  it('register starts nothing and imports nothing', async () => {
    const { register } = await import('./instrumentation');
    await register();
    expect(sdk.imported).not.toHaveBeenCalled();
    expect(sdk.init).not.toHaveBeenCalled();
  });

  it('onRequestError reports nothing and imports nothing', async () => {
    const { onRequestError } = await import('./instrumentation');
    await onRequestError(new Error('boom'), request, context);
    expect(sdk.imported).not.toHaveBeenCalled();
    expect(sdk.captureRequestError).not.toHaveBeenCalled();
  });
});

describe('with a DSN', () => {
  it('register starts the SDK once on the Node server, without private data', async () => {
    const { register } = await import('./instrumentation');
    await register();
    expect(sdk.init).toHaveBeenCalledTimes(1);
    expect(sdk.init.mock.calls[0]?.[0]).toMatchObject({ dsn: DSN, sendDefaultPii: false });
  });

  it('asks for errors only: no tracing, and no «session» for a request or for the process', async () => {
    const { register } = await import('./instrumentation');
    await register();
    const given = sdk.init.mock.calls[0]?.[0] as {
      integrations: (defaults: Array<{ name: string }>) => Array<{ name: string }>;
    };
    expect(given).not.toHaveProperty('tracesSampleRate');
    expect(given).not.toHaveProperty('profilesSampleRate');
    // The SDK's own list, with the process session dropped and its Http swapped for ours.
    const kept = given.integrations(
      ['InboundFilters', 'ProcessSession', 'Http', 'OnUncaughtException'].map((name) => ({ name })),
    );
    expect(kept.map((item) => item.name)).toEqual([
      'InboundFilters',
      'OnUncaughtException',
      'Http',
    ]);
    expect(sdk.httpIntegration).toHaveBeenCalledWith({
      disableIncomingRequestSpans: true,
      trackIncomingRequestsAsSessions: false,
    });
  });

  it('the server’s reports pass the same filter: service tag, no query strings', async () => {
    const { register } = await import('./instrumentation');
    await register();
    const { beforeSend } = sdk.init.mock.calls[0]?.[0] as {
      beforeSend: (event: unknown, hint?: unknown) => any;
    };
    const out = beforeSend(
      {
        exception: { values: [{ type: 'Error', value: 'render failed for +998 90 123 45 67' }] },
        contexts: { nextjs: { request_path: '/orders?search=Alisher' } },
      },
      { originalException: new TypeError('x') },
    );
    expect(out.tags).toEqual({ service: 'admin' });
    expect(out.exception.values[0].value).toBe('render failed for [phone]');
    expect(out.contexts.nextjs.request_path).toBe('/orders');
  });

  it('the edge runtime does not carry the SDK', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'edge');
    const { register, onRequestError } = await import('./instrumentation');
    await register();
    await onRequestError(new Error('boom'), request, context);
    expect(sdk.imported).not.toHaveBeenCalled();
  });

  it('onRequestError hands the error and its request to the SDK', async () => {
    const { onRequestError } = await import('./instrumentation');
    const error = new Error('boom');
    await onRequestError(error, request, context);
    expect(sdk.captureRequestError).toHaveBeenCalledTimes(1);
    expect(sdk.captureRequestError).toHaveBeenCalledWith(error, request, context);
  });
});
