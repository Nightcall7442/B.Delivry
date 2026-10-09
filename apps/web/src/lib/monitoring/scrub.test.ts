import { describe, expect, it } from 'vitest';

import { PHONE_MASK, TOKEN_MASK, scrubDeep, scrubText } from './scrub';

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
