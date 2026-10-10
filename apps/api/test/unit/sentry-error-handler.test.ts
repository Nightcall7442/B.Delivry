/**
 * What the error handler reports. A 5xx is ours (it pages someone, and now it reaches Sentry); a
 * 4xx is the caller's situation, answered and finished, and is never reported. Reporting is a
 * side channel: whatever the reporter does, the caller still gets the same answer.
 */
import Fastify, { type FastifyInstance } from 'fastify';
import { ZodError, z } from 'zod';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../../src/common/errors/app.error.js';
import {
  ConflictError,
  CouponError,
  ForbiddenError,
  NotFoundError,
  ProviderError,
  RateLimitedError,
  StoreClosedError,
  UnauthorizedError,
  ValidationError,
} from '../../src/common/errors/domain.errors.js';
import { ERROR_CODE } from '../../src/common/errors/error-codes.js';
import {
  noopErrorReporter,
  setErrorReporter,
  type ErrorContext,
  type ErrorReporter,
} from '../../src/infrastructure/telemetry/error-reporting.js';
import { registerErrorHandler } from '../../src/middleware/error-handler.middleware.js';
import { registerRequestId } from '../../src/middleware/request-id.middleware.js';

interface Report {
  error: unknown;
  context: ErrorContext | undefined;
}

function recorder(): ErrorReporter & { reports: Report[] } {
  const reports: Report[] = [];
  return {
    reports,
    capture(error, context) {
      reports.push({ error, context });
    },
    flush: async () => true,
  };
}

const zodError = (): ZodError => {
  const result = z.object({ name: z.string() }).safeParse({});
  if (result.success) throw new Error('expected a failure');
  return result.error;
};

const prismaError = (code: string): Error => Object.assign(new Error(`prisma ${code}`), { code });

/** What a route may throw, by name. The URL names it, so one route pattern serves them all. */
const THROWS: Record<string, () => unknown> = {
  plain: () => new Error('db down for +998901234567'),
  'non-error': () => 'a string was thrown',
  internal: () => new AppError(ERROR_CODE.INTERNAL, 500, 'kaboom'),
  provider: () => new ProviderError('eskiz', 'gateway timeout'),
  unavailable: () => new AppError(ERROR_CODE.UNAVAILABLE, 503, 'try later'),
  'fastify-5xx': () => Object.assign(new Error('upstream'), { statusCode: 503 }),

  validation: () => new ValidationError({ name: ['required'] }),
  'bad-request': () => new AppError(ERROR_CODE.VALIDATION, 400, 'bad request'),
  unauthorized: () => new UnauthorizedError(),
  forbidden: () => new ForbiddenError(),
  'not-found': () => new NotFoundError('Order', 'o1'),
  conflict: () => new ConflictError('already there'),
  unprocessable: () => new CouponError(ERROR_CODE.COUPON_EXPIRED, 'coupon expired'),
  'rate-limited': () => new RateLimitedError(30),
  'store-closed': () => new StoreClosedError('s1'),
  zod: () => zodError(),
  'prisma-unique': () => prismaError('P2002'),
  'prisma-missing': () => prismaError('P2025'),
  'fastify-4xx': () => Object.assign(new Error('bad input'), { statusCode: 400 }),
};

const REPORTED = ['plain', 'non-error', 'internal', 'provider', 'unavailable', 'fastify-5xx'];
const NOT_REPORTED: [string, number][] = [
  ['validation', 422],
  ['bad-request', 400],
  ['unauthorized', 401],
  ['forbidden', 403],
  ['not-found', 404],
  ['conflict', 409],
  ['unprocessable', 422],
  ['rate-limited', 429],
  ['store-closed', 409],
  ['zod', 422],
  ['prisma-unique', 409],
  ['prisma-missing', 404],
  ['fastify-4xx', 400],
];

const apps: FastifyInstance[] = [];

async function appWith(reporter?: ErrorReporter, bodyLimit?: number): Promise<FastifyInstance> {
  const app = Fastify(bodyLimit === undefined ? {} : { bodyLimit });
  apps.push(app);
  registerRequestId(app);
  // What the auth and tenant hooks leave on a request, driven by a test header.
  app.addHook('onRequest', async (request) => {
    const user = request.headers['x-test-user'];
    if (typeof user === 'string') {
      request.user = {
        id: user,
        roles: [],
        permissions: [],
        tenantId: 'tenant-1',
        sessionId: 's1',
        locale: 'uz',
        phone: '+998901234567',
      };
      request.tenant = { tenantId: 'tenant-1', slug: 'urgench', active: true };
    }
  });
  registerErrorHandler(app, reporter);
  const fail = async (request: { params: unknown }): Promise<never> => {
    const { name } = request.params as { name: string };
    throw THROWS[name]?.();
  };
  app.get('/fail/:name', fail);
  app.post('/fail/:name', fail);
  app.post('/echo', async () => ({ ok: true }));
  return app;
}

afterEach(async () => {
  setErrorReporter(noopErrorReporter);
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('a request that cannot be described', () => {
  it('is still answered with the same 500, and nothing is reported', async () => {
    const reporter = recorder();
    const app = Fastify();
    apps.push(app);
    registerRequestId(app);
    app.addHook('onRequest', async (request) => {
      // Whatever the auth and tenant hooks leave on a request, reading it throws.
      Object.defineProperty(request, 'tenant', {
        get() {
          throw new Error('tenant context is gone');
        },
      });
    });
    registerErrorHandler(app, reporter);
    app.get('/fail', async () => {
      throw new Error('db down');
    });

    const response = await app.inject({ method: 'GET', url: '/fail' });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toMatchObject({ ok: false, error: { code: ERROR_CODE.INTERNAL } });
    expect(reporter.reports).toEqual([]);
  });
});

describe('what is reported', () => {
  it.each(REPORTED)('a server fault is reported: %s', async (name) => {
    const reporter = recorder();
    const app = await appWith(reporter);

    const response = await app.inject({ method: 'GET', url: `/fail/${name}` });

    expect(response.statusCode).toBeGreaterThanOrEqual(500);
    expect(reporter.reports).toHaveLength(1);
  });

  it('reports the original error, not the 500 it was wrapped in', async () => {
    const reporter = recorder();
    const app = await appWith(reporter);

    await app.inject({ method: 'GET', url: '/fail/plain' });

    expect(reporter.reports[0]?.error).toBeInstanceOf(Error);
    expect((reporter.reports[0]?.error as Error).message).toBe('db down for +998901234567');
  });

  it('reports an AppError of 5xx as itself, with its own status and code', async () => {
    const reporter = recorder();
    const app = await appWith(reporter);

    const response = await app.inject({ method: 'GET', url: '/fail/provider' });

    expect(response.statusCode).toBe(502);
    expect(reporter.reports[0]?.error).toBeInstanceOf(ProviderError);
    expect(reporter.reports[0]?.context?.tags).toMatchObject({
      status: 502,
      error_code: ERROR_CODE.PROVIDER_ERROR,
    });
  });

  it('tags the report with the request id that finds the request in the logs', async () => {
    const reporter = recorder();
    const app = await appWith(reporter);

    const response = await app.inject({
      method: 'GET',
      url: '/fail/plain',
      headers: { 'x-request-id': 'req-abc-123' },
    });

    expect(response.headers['x-request-id']).toBe('req-abc-123');
    expect(response.json().error.requestId).toBe('req-abc-123');
    expect(reporter.reports[0]?.context?.tags).toMatchObject({
      source: 'http',
      request_id: 'req-abc-123',
      method: 'GET',
      status: 500,
      error_code: ERROR_CODE.INTERNAL,
    });
  });

  it('names the route by its pattern, never by the URL with its ids and query', async () => {
    const reporter = recorder();
    const app = await appWith(reporter);

    await app.inject({ method: 'GET', url: '/fail/plain?token=SECRET-QUERY&phone=998901234567' });

    expect(reporter.reports[0]?.context?.tags?.route).toBe('/fail/:name');
  });

  it('carries the tenant and an opaque user id when the request had them', async () => {
    const reporter = recorder();
    const app = await appWith(reporter);

    await app.inject({ method: 'GET', url: '/fail/plain', headers: { 'x-test-user': 'user-7' } });

    expect(reporter.reports[0]?.context?.tags).toMatchObject({ tenant_id: 'tenant-1' });
    expect(reporter.reports[0]?.context?.userId).toBe('user-7');
  });

  it('has no tenant and no user for an anonymous request', async () => {
    const reporter = recorder();
    const app = await appWith(reporter);

    await app.inject({ method: 'GET', url: '/fail/plain' });

    expect(reporter.reports[0]?.context?.tags?.tenant_id).toBeUndefined();
    expect(reporter.reports[0]?.context?.userId).toBeNull();
  });

  it('never puts the body, the headers, the query or the phone number in the report', async () => {
    const reporter = recorder();
    const app = await appWith(reporter);

    await app.inject({
      method: 'POST',
      url: '/fail/plain?token=SECRET-QUERY',
      headers: {
        authorization: 'Bearer SECRET-HEADER',
        cookie: 'sid=SECRET-COOKIE',
        'x-test-user': 'user-7',
      },
      payload: { password: 'SECRET-BODY', phone: '+998901234567' },
    });

    expect(reporter.reports).toHaveLength(1);
    // Only the context: the error itself carries its own message, which the SDK scrubs.
    const context = JSON.stringify(reporter.reports[0]?.context);
    for (const secret of [
      'SECRET-QUERY',
      'SECRET-HEADER',
      'SECRET-COOKIE',
      'SECRET-BODY',
      '998901234567',
    ]) {
      expect(context, secret).not.toContain(secret);
    }
    expect(Object.keys(reporter.reports[0]?.context ?? {}).sort()).toEqual(['tags', 'userId']);
  });

  it('reports through the process reporter when none is passed', async () => {
    const reporter = recorder();
    setErrorReporter(reporter);
    const app = await appWith();

    await app.inject({ method: 'GET', url: '/fail/plain' });

    expect(reporter.reports).toHaveLength(1);
  });
});

describe('what is not reported', () => {
  it.each(NOT_REPORTED)('the caller’s situation is not: %s (%i)', async (name, status) => {
    const reporter = recorder();
    const app = await appWith(reporter);

    const response = await app.inject({ method: 'GET', url: `/fail/${name}` });

    expect(response.statusCode).toBe(status);
    expect(reporter.reports).toEqual([]);
  });

  it('an invalid JSON body (400) and a body over the limit (413) are not', async () => {
    const reporter = recorder();
    const app = await appWith(reporter, 32);

    const malformed = await app.inject({
      method: 'POST',
      url: '/echo',
      headers: { 'content-type': 'application/json' },
      payload: '{ not json',
    });
    const tooLarge = await app.inject({
      method: 'POST',
      url: '/echo',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ filler: 'x'.repeat(200) }),
    });

    expect(malformed.statusCode).toBe(400);
    expect(tooLarge.statusCode).toBe(413);
    expect(reporter.reports).toEqual([]);
  });
});

describe('the answer does not depend on reporting', () => {
  const answers = async (reporter: ErrorReporter | undefined, name: string) => {
    const app = await appWith(reporter);
    const response = await app.inject({
      method: 'GET',
      url: `/fail/${name}`,
      headers: { 'x-request-id': 'req-fixed' },
    });
    return {
      status: response.statusCode,
      body: response.json(),
      retry: response.headers['retry-after'],
    };
  };

  it('answers a 500 with the bare error and the request id, and nothing of the cause', async () => {
    const { status, body } = await answers(recorder(), 'plain');

    expect(status).toBe(500);
    expect(body).toEqual({
      ok: false,
      error: {
        code: ERROR_CODE.INTERNAL,
        message: 'Internal server error',
        requestId: 'req-fixed',
      },
    });
  });

  it('still answers when the reporter throws', async () => {
    const throwing: ErrorReporter = {
      capture: vi.fn(() => {
        throw new Error('reporter is broken');
      }),
      flush: async () => true,
    };

    for (const name of ['plain', 'provider', 'not-found']) {
      const withBrokenReporter = await answers(throwing, name);
      const withoutReporter = await answers(noopErrorReporter, name);
      expect(withBrokenReporter, name).toEqual(withoutReporter);
    }
    expect(throwing.capture).toHaveBeenCalledTimes(2);
  });

  it('answers the same with and without a reporter, including the headers it sets', async () => {
    for (const name of ['plain', 'internal', 'rate-limited', 'validation']) {
      expect(await answers(recorder(), name), name).toEqual(await answers(noopErrorReporter, name));
    }
    expect((await answers(noopErrorReporter, 'rate-limited')).retry).toBe('30');
  });
});
