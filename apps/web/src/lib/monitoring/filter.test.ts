import { ApiError } from '@bazar/api-client';
import type { ErrorEvent } from '@sentry/nextjs';
import { describe, expect, it } from 'vitest';

import { beforeSend, isExpected } from './filter';

const event = (message: string, extra: Partial<ErrorEvent> = {}): ErrorEvent => ({
  type: undefined,
  exception: { values: [{ type: 'Error', value: message }] },
  ...extra,
});

describe('which errors are expected', () => {
  it('treats a 4xx answer and a request that got no answer as the person’s and the network’s', () => {
    expect(isExpected(new ApiError(404, { code: 'NOT_FOUND', message: 'x' }))).toBe(true);
    expect(isExpected(new ApiError(422, { code: 'VALIDATION', message: 'x' }))).toBe(true);
    expect(isExpected(new ApiError(401, { code: 'UNAUTHORIZED', message: 'x' }))).toBe(true);
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

describe('beforeSend', () => {
  it('drops expected API errors', () => {
    const error = new ApiError(403, { code: 'FORBIDDEN', message: 'no' });
    expect(beforeSend(event('no'), { originalException: error })).toBeNull();
  });

  it.each([
    'ChunkLoadError: Loading chunk 123 failed.',
    'Loading chunk app-pages-internals failed',
    'Failed to fetch dynamically imported module: https://x.uz/_next/a.js',
    'ResizeObserver loop completed with undelivered notifications.',
  ])('drops a failure of the road: %s', (message) => {
    expect(beforeSend(event(message))).toBeNull();
  });

  it('tags a server error with the id the API logged it under', () => {
    const error = new ApiError(500, { code: 'INTERNAL', message: 'x', requestId: 'req-42' });
    const out = beforeSend(event('x'), { originalException: error });
    expect(out?.tags).toMatchObject({
      'api.status': '500',
      'api.code': 'INTERNAL',
      'api.request_id': 'req-42',
    });
  });

  it('sends our own exceptions, with phone numbers and tokens masked', () => {
    const out = beforeSend(
      event('cannot format +998 90 123 45 67', {
        request: { url: 'https://bazar.uz/ru/login?phone=998901234567' },
      }),
      { originalException: new TypeError('x') },
    );
    expect(out).not.toBeNull();
    expect(JSON.stringify(out)).not.toMatch(/998\d{2}/);
    expect(out?.exception?.values?.[0]?.value).toBe('cannot format [phone]');
  });
});
