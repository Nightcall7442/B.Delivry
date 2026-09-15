import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';

import { middleware, preferredLocale } from './middleware';

function request(path: string, headers: Record<string, string> = {}, cookie?: string) {
  const req = new NextRequest(new URL(path, 'https://bazar.uz'), { headers: new Headers(headers) });
  if (cookie) req.cookies.set('locale', cookie);
  return req;
}

describe('preferredLocale', () => {
  it('defaults to ru when nothing is offered', () => {
    expect(preferredLocale(request('/'))).toBe('ru');
  });

  it('reads the first tag we actually serve, ignoring ones we do not', () => {
    expect(preferredLocale(request('/', { 'accept-language': 'de-DE,de;q=0.9,uz;q=0.8' }))).toBe(
      'uz',
    );
  });

  it('matches on the language subtag, not the full tag', () => {
    expect(preferredLocale(request('/', { 'accept-language': 'en-GB' }))).toBe('en');
  });

  it('lets the cookie win over the browser header', () => {
    expect(preferredLocale(request('/', { 'accept-language': 'en' }, 'uz'))).toBe('uz');
  });

  it('falls back to ru when the cookie holds a locale we dropped', () => {
    expect(preferredLocale(request('/', {}, 'kk'))).toBe('ru');
  });
});

describe('middleware', () => {
  it('sends a bare path to the preferred locale without doubling the slash', () => {
    expect(middleware(request('/')).headers.get('location')).toBe('https://bazar.uz/ru');
    expect(middleware(request('/catalog')).headers.get('location')).toBe(
      'https://bazar.uz/ru/catalog',
    );
  });

  it('leaves an already-localised path alone', () => {
    expect(middleware(request('/uz/catalog')).headers.get('location')).toBeNull();
  });

  it('remembers the locale from the URL', () => {
    expect(middleware(request('/en')).cookies.get('locale')?.value).toBe('en');
  });
});
