import { describe, expect, it } from 'vitest';

import { PHONE_MASK, TOKEN_MASK, scrubDeep, scrubText, stripRequest } from './scrub';

const JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

describe('scrubText', () => {
  it.each([
    '+998 90 123 45 67',
    '+998901234567',
    '998901234567',
    '+998(90)123-45-67',
    '+998 90 123-45-67',
  ])('masks the phone %s however it is written', (phone) => {
    expect(scrubText(`code sent to ${phone} failed`)).toBe(`code sent to ${PHONE_MASK} failed`);
  });

  it('masks a session token wherever it sits', () => {
    expect(scrubText(`Bearer ${JWT}`)).toBe(`Bearer ${TOKEN_MASK}`);
    expect(scrubText(`https://x.uz/cb?token=${JWT}&a=1`)).toBe(
      `https://x.uz/cb?token=${TOKEN_MASK}&a=1`,
    );
  });

  it('leaves the rest alone: ids, prices, dates, short numbers', () => {
    const text = 'order 3f2c1a9e-7b1d-4c3e-9a55-0123456789ab total 1 250 000 at 2026-10-09 / 12';
    expect(scrubText(text)).toBe(text);
  });
});

describe('scrubDeep', () => {
  it('masks every string in a nested event, arrays included, and returns the same object', () => {
    const event = {
      message: 'call +998 90 123 45 67',
      exception: {
        values: [
          { value: `bad ${JWT}`, stacktrace: { frames: [{ filename: 'a.js', lineno: 3 }] } },
        ],
      },
      breadcrumbs: [{ message: 'tel 998901234567', data: { url: '/x?p=+998901234567' } }],
      tags: { n: 5 },
    };
    const out = scrubDeep(event);
    expect(out).toBe(event);
    expect(JSON.stringify(out)).not.toMatch(/998\d|eyJ/);
    expect(out.exception.values[0]?.stacktrace.frames[0]).toEqual({ filename: 'a.js', lineno: 3 });
    expect(out.tags).toEqual({ n: 5 });
  });

  it('survives a cycle and a very deep tree', () => {
    const loop: Record<string, unknown> = { note: '+998901234567' };
    loop['self'] = loop;
    expect(() => scrubDeep(loop)).not.toThrow();
    expect(loop['note']).toBe(PHONE_MASK);

    let deep: Record<string, unknown> = { leaf: 'x' };
    for (let i = 0; i < 200; i += 1) deep = { inner: deep };
    expect(() => scrubDeep(deep)).not.toThrow();
  });
});

describe('what an exception message built from our own addresses can carry', () => {
  it('masks a Telegram bot token in a URL', () => {
    const text =
      'fetch failed https://api.telegram.org/bot123456789:AAEhBP0av28jTUyDdcjPwLXx1b4W6pX8r9Y/sendMessage';
    expect(scrubText(text)).toBe('fetch failed https://api.telegram.org/bot[token]/sendMessage');
  });

  it('masks the credentials of a database or broker address, and keeps the host', () => {
    expect(
      scrubText('connect failed postgres://bazar:SuperSecretPw@db.railway.internal:5432/bazar'),
    ).toBe('connect failed postgres://[credentials]@db.railway.internal:5432/bazar');
    expect(scrubText('redis://:onlypass@cache:6379')).toBe('redis://:onlypass@cache:6379');
  });

  it('leaves an ordinary address alone', () => {
    expect(scrubText('GET https://bazar-delivery.uz/ru/orders/42')).toBe(
      'GET https://bazar-delivery.uz/ru/orders/42',
    );
  });
});

describe('stripRequest', () => {
  it('drops cookies, body, query string and env, and keeps only the browser and the language', () => {
    const event = {
      request: {
        url: 'https://admin.bazar-delivery.uz/orders?phone=%2B998901234567#top',
        query_string: 'phone=1',
        cookies: { sid: 'x' },
        data: { a: 1 },
        env: { REMOTE_ADDR: '1.2.3.4' },
        headers: {
          Cookie: 'a=b',
          Authorization: 'Bearer x',
          'X-Forwarded-For': '1.2.3.4',
          'x-envoy-external-address': '1.2.3.4',
          'X-Api-Key': 'k',
          'User-Agent': 'UA',
          'Accept-Language': 'ru',
        },
      },
      breadcrumbs: [
        { data: { url: '/api/orders?q=998901234567', 'http.query': 'q=1', 'http.fragment': 'x' } },
        { data: { from: '/a?x=1', to: '/b?y=2' } },
        {},
      ],
    };
    stripRequest(event);
    expect(event.request).toEqual({
      url: 'https://admin.bazar-delivery.uz/orders',
      headers: { 'User-Agent': 'UA', 'Accept-Language': 'ru' },
    });
    expect(event.breadcrumbs[0]?.data).toEqual({ url: '/api/orders' });
    expect(event.breadcrumbs[1]?.data).toEqual({ from: '/a', to: '/b' });
  });

  it('is a no-op on an event with no request', () => {
    expect(() => stripRequest({})).not.toThrow();
  });
});
