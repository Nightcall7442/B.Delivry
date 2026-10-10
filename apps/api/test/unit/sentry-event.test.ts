/**
 * What leaves the API in an error report: the phone numbers and session tokens that turn up in
 * messages, stacks and breadcrumbs are masked, and nothing of the request or the person is kept
 * but an opaque user id.
 */
import type { ErrorEvent } from '@sentry/node';
import { describe, expect, it } from 'vitest';
import { sanitizeEvent } from '../../src/infrastructure/telemetry/error-event.js';

const PHONE = '+998 90 123 45 67';
const PHONE_COMPACT = '998901234567';
const JWT =
  'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';

const dirty = (): ErrorEvent =>
  ({
    message: `sms to ${PHONE} failed`,
    exception: {
      values: [
        {
          type: `Error for ${PHONE_COMPACT}`,
          value: `bad token ${JWT} for ${PHONE}`,
          stacktrace: {
            frames: [
              {
                filename: '/app/dist/orders.js',
                context_line: `const phone = '${PHONE_COMPACT}';`,
                pre_context: [`// ${PHONE}`],
                post_context: [`// ${JWT}`],
                vars: { body: { phone: PHONE }, token: JWT },
              },
            ],
          },
        },
      ],
    },
    breadcrumbs: [
      {
        message: `called ${PHONE}`,
        data: { authorization: `Bearer ${JWT}`, nested: { p: PHONE } },
      },
    ],
    extra: { note: `user ${PHONE_COMPACT}`, deep: { deeper: { list: [`${PHONE}`] } } },
    tags: { request_id: `req-${PHONE_COMPACT}`, route: '/orders/:id' },
    contexts: { custom: { value: JWT } },
    request: {
      method: 'POST',
      url: 'https://api.bazar-delivery.uz/api/v1/auth/verify?phone=%2B998901234567&token=x#frag',
      headers: { authorization: `Bearer ${JWT}`, cookie: 'sid=1', 'x-forwarded-for': '1.2.3.4' },
      cookies: { sid: 'secret-session' },
      data: { phone: PHONE, code: '123456' },
      query_string: `phone=${PHONE_COMPACT}`,
      env: { REMOTE_ADDR: '203.0.113.9' },
    },
    user: {
      id: 'user-1',
      ip_address: '203.0.113.9',
      email: 'someone@example.com',
      username: 'someone',
      geo: { city: 'Urgench' },
      segment: 'vip',
    },
  }) as unknown as ErrorEvent;

describe('masking', () => {
  it('masks phones and tokens in the message, the exception, the stack and the breadcrumbs', () => {
    const event = sanitizeEvent(dirty());
    const text = JSON.stringify(event);

    expect(text).not.toContain('90 123 45 67');
    expect(text).not.toContain(PHONE_COMPACT);
    expect(text).not.toContain('eyJhbGci');

    expect(event.message).toBe('sms to [phone] failed');
    const exception = event.exception?.values?.[0];
    expect(exception?.type).toBe('Error for [phone]');
    expect(exception?.value).toBe('bad token [token] for [phone]');
    const frame = exception?.stacktrace?.frames?.[0];
    expect(frame?.context_line).toBe("const phone = '[phone]';");
    expect(frame?.pre_context).toEqual(['// [phone]']);
    expect(frame?.post_context).toEqual(['// [token]']);
    expect(event.breadcrumbs?.[0]?.message).toBe('called [phone]');
    expect(event.breadcrumbs?.[0]?.data).toEqual({
      authorization: 'Bearer [token]',
      nested: { p: '[phone]' },
    });
  });

  it('masks phones and tokens in extra, tags and contexts, however deep', () => {
    const event = sanitizeEvent(dirty());
    expect(event.extra).toEqual({ note: 'user [phone]', deep: { deeper: { list: ['[phone]'] } } });
    expect(event.tags).toEqual({ request_id: 'req-[phone]', route: '/orders/:id' });
    expect(event.contexts).toEqual({ custom: { value: '[token]' } });
  });

  it('keeps what finds the failure', () => {
    const event = sanitizeEvent(dirty());
    expect(event.tags?.route).toBe('/orders/:id');
    expect(event.exception?.values?.[0]?.stacktrace?.frames?.[0]?.filename).toBe(
      '/app/dist/orders.js',
    );
  });
});

describe('what is not kept at all', () => {
  it('drops the request headers, cookies, body, query string and address', () => {
    const request = sanitizeEvent(dirty()).request;
    expect(request).toBeDefined();
    expect(request).not.toHaveProperty('headers');
    expect(request).not.toHaveProperty('cookies');
    expect(request).not.toHaveProperty('data');
    expect(request).not.toHaveProperty('query_string');
    expect(request).not.toHaveProperty('env');
  });

  it('keeps the method and the path of the request, without its query or fragment', () => {
    const request = sanitizeEvent(dirty()).request;
    expect(request?.method).toBe('POST');
    expect(request?.url).toBe('https://api.bazar-delivery.uz/api/v1/auth/verify');
  });

  it('keeps only the opaque id of the user', () => {
    const event = sanitizeEvent(dirty());
    expect(event.user).toEqual({ id: 'user-1' });
  });

  it('keeps no user at all when there is no id to keep', () => {
    const event = dirty();
    event.user = { ip_address: '203.0.113.9', email: 'someone@example.com' };
    expect(sanitizeEvent(event)).not.toHaveProperty('user');
  });

  it('drops the local variables of a stack frame', () => {
    const frame = sanitizeEvent(dirty()).exception?.values?.[0]?.stacktrace?.frames?.[0];
    expect(frame).not.toHaveProperty('vars');
  });
});

describe('an event with nothing to hide', () => {
  it('goes out as it was, and is never dropped', () => {
    const event = { message: 'plain', tags: { service: 'api' } } as unknown as ErrorEvent;
    expect(sanitizeEvent(event)).toEqual({ message: 'plain', tags: { service: 'api' } });
  });
});
