import { ApiError } from '@bazar/api-client';
import type { ErrorEvent } from '@sentry/nextjs';
import { describe, expect, it } from 'vitest';

import { beforeSend, isExpected } from './filter';

const event = (message: string, extra: Partial<ErrorEvent> = {}): ErrorEvent => ({
  type: undefined,
  exception: { values: [{ type: 'Error', value: message }] },
  ...extra,
});

const JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

describe('which errors are expected', () => {
  it('treats a 4xx answer and a request that got no answer as the operator’s and the network’s', () => {
    expect(isExpected(new ApiError(404, { code: 'NOT_FOUND', message: 'x' }))).toBe(true);
    expect(isExpected(new ApiError(422, { code: 'VALIDATION', message: 'x' }))).toBe(true);
    expect(isExpected(new ApiError(401, { code: 'UNAUTHORIZED', message: 'x' }))).toBe(true);
    expect(isExpected(new ApiError(429, { code: 'RATE_LIMITED', message: 'x' }))).toBe(true);
    expect(isExpected(ApiError.network(new Error('offline')))).toBe(true);
    // A captive portal or proxy page that was not the API at all.
    expect(isExpected(ApiError.malformed(200))).toBe(true);
  });

  it('keeps a server that answered with an error, and every other exception', () => {
    expect(isExpected(new ApiError(500, { code: 'INTERNAL', message: 'x' }))).toBe(false);
    expect(isExpected(ApiError.malformed(502))).toBe(false);
    expect(isExpected(new TypeError('x is undefined'))).toBe(false);
    expect(isExpected('a string was thrown')).toBe(false);
    expect(isExpected(undefined)).toBe(false);
  });
});

describe('beforeSend: what is dropped', () => {
  it.each([
    [400, 'VALIDATION'],
    [401, 'UNAUTHORIZED'],
    [403, 'FORBIDDEN'],
    [404, 'NOT_FOUND'],
    [429, 'RATE_LIMITED'],
  ])('drops an API %i answer: the operator was already shown it', (status, code) => {
    const error = new ApiError(status, { code, message: 'no' });
    expect(beforeSend(event('no'), { originalException: error })).toBeNull();
  });

  it('drops a request that never got an answer (no network)', () => {
    const error = ApiError.network(new TypeError('Failed to fetch'));
    expect(beforeSend(event('Network request failed'), { originalException: error })).toBeNull();
  });

  it.each([
    'ChunkLoadError: Loading chunk 123 failed.',
    'Loading chunk app-pages-internals failed',
    'Loading CSS chunk 9 failed',
    'Failed to fetch dynamically imported module: https://x.uz/_next/a.js',
    'Importing a module script failed.',
    'ResizeObserver loop completed with undelivered notifications.',
  ])('drops a failure of the road: %s', (message) => {
    expect(beforeSend(event(message))).toBeNull();
  });

  it('reads the message from the event as well as from the exception type', () => {
    expect(
      beforeSend({ type: undefined, message: 'ResizeObserver loop limit exceeded' }),
    ).toBeNull();
  });
});

describe('beforeSend: what is reported', () => {
  it('tags a server error with the id the API logged it under', () => {
    const error = new ApiError(500, { code: 'INTERNAL', message: 'x', requestId: 'req-42' });
    const out = beforeSend(event('x'), { originalException: error });
    expect(out?.tags).toMatchObject({
      'api.status': '500',
      'api.code': 'INTERNAL',
      'api.request_id': 'req-42',
    });
  });

  it('does not invent an id the API did not give', () => {
    const error = ApiError.malformed(502);
    const out = beforeSend(event('x'), { originalException: error });
    expect(out?.tags).toMatchObject({ 'api.status': '502', 'api.code': 'MALFORMED_RESPONSE' });
    expect(out?.tags).not.toHaveProperty('api.request_id');
  });

  it('names the service on every report, ours or the API’s, and keeps the tags it had', () => {
    const own = beforeSend(event('x', { tags: { runtime: 'node' } }), {
      originalException: new TypeError('x'),
    });
    expect(own?.tags).toEqual({ runtime: 'node', service: 'admin' });
    const api = beforeSend(event('x'), {
      originalException: new ApiError(503, { code: 'DOWN', message: 'x', requestId: 'r1' }),
    });
    expect(api?.tags).toMatchObject({ service: 'admin', 'api.status': '503' });
  });

  it('sends a thrown string and an event with no hint at all', () => {
    expect(beforeSend(event('x'))).not.toBeNull();
    expect(beforeSend(event('x'), { originalException: 'a string was thrown' })).not.toBeNull();
  });
});

describe('beforeSend: nothing of the page leaves', () => {
  it('masks phone numbers and tokens in every string, wherever they sit', () => {
    const out = beforeSend(
      event('cannot format +998 90 123 45 67', {
        breadcrumbs: [
          { category: 'fetch', message: `Bearer ${JWT}`, data: { note: '998901234567' } },
        ],
        extra: { customer: '+998(90)123-45-67' },
      }),
      { originalException: new TypeError('x') },
    );
    expect(out).not.toBeNull();
    expect(JSON.stringify(out)).not.toMatch(/998\d{2}|eyJ/);
    expect(out?.exception?.values?.[0]?.value).toBe('cannot format [phone]');
  });

  it('cuts the query string and the fragment from every address, and keeps the path', () => {
    const out = beforeSend(
      event('x', {
        request: {
          url: 'https://admin.bazar-delivery.uz/orders/3f2c1a9e?search=Alisher%20Karimov&q=ул.%20Навои#top',
          query_string: 'search=Alisher%20Karimov',
          headers: {
            'User-Agent': 'Mozilla/5.0',
            Referer: 'https://admin.bazar-delivery.uz/couriers?name=Bobur',
          },
        },
        breadcrumbs: [
          {
            category: 'fetch',
            type: 'http',
            data: {
              url: 'https://api.bazar-delivery.uz/api/v1/orders?search=Alisher&limit=20',
              method: 'GET',
              status_code: 200,
            },
          },
          { category: 'xhr', data: { url: '/api/v1/couriers?phone=901234567', method: 'GET' } },
          {
            category: 'navigation',
            data: { from: '/orders?status=NEW&q=Alisher', to: '/orders/3f2c1a9e?tab=items' },
          },
        ],
        contexts: { nextjs: { request_path: '/orders/3f2c1a9e?x=1', router_kind: 'App Router' } },
      }),
      { originalException: new TypeError('x') },
    );
    expect(out?.request?.url).toBe('https://admin.bazar-delivery.uz/orders/3f2c1a9e');
    expect(out?.request).not.toHaveProperty('query_string');
    // The browser stays; the page the person came from does not (the address above says where).
    expect(out?.request?.headers).toEqual({ 'User-Agent': 'Mozilla/5.0' });
    expect(out?.breadcrumbs?.map((crumb) => crumb.data)).toEqual([
      {
        url: 'https://api.bazar-delivery.uz/api/v1/orders',
        method: 'GET',
        status_code: 200,
      },
      { url: '/api/v1/couriers', method: 'GET' },
      { from: '/orders', to: '/orders/3f2c1a9e' },
    ]);
    expect(out?.contexts?.['nextjs']).toEqual({
      request_path: '/orders/3f2c1a9e',
      router_kind: 'App Router',
    });
    expect(JSON.stringify(out)).not.toMatch(/Alisher|Karimov|Навои|Bobur|901234567/);
  });

  it('drops cookies, credentials and request bodies', () => {
    const out = beforeSend(
      event('x', {
        request: {
          url: 'https://admin.bazar-delivery.uz/orders',
          cookies: { session: 'abc' },
          data: { phone: 'secret', address: 'ул. Навои, 5' },
          headers: {
            Cookie: 'session=abc',
            authorization: 'Bearer abc',
            'Set-Cookie': 'a=b',
            // Names a proxy adds: nobody lists them all, so only the browser and the language stay.
            'X-Forwarded-For': '203.0.113.7',
            'X-Envoy-External-Address': '203.0.113.7',
            'X-Api-Key': 'key',
            'CF-IPCountry': 'UZ',
            'User-Agent': 'Mozilla/5.0',
            'Accept-Language': 'ru',
            Accept: 'text/html',
          },
          env: { REMOTE_ADDR: '203.0.113.7' },
        },
      }),
      { originalException: new TypeError('x') },
    );
    expect(out?.request).toEqual({
      url: 'https://admin.bazar-delivery.uz/orders',
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'ru' },
    });
  });

  it('leaves an event with no request, no trail and no context alone', () => {
    const out = beforeSend(event('plain'), { originalException: new TypeError('x') });
    expect(out?.exception?.values?.[0]?.value).toBe('plain');
    expect(out).not.toHaveProperty('request');
  });
});
