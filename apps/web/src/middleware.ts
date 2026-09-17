/**
 * Next middleware: locale detection (uz/ru/en), auth redirect.
 *
 * Every public URL carries its locale, so a request without one is rewritten to
 * the visitor's best match: the cookie they were last served, then Accept-Language,
 * then ru. Auth redirects live in the route handlers, not here — middleware runs
 * on every asset request and has no business touching the session store.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const LOCALES = ['ru', 'uz', 'en'] as const;
const DEFAULT_LOCALE = 'ru';
const COOKIE = 'locale';

type Locale = (typeof LOCALES)[number];

function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

export function preferredLocale(request: NextRequest): Locale {
  const fromCookie = request.cookies.get(COOKIE)?.value;
  if (fromCookie && isLocale(fromCookie)) return fromCookie;

  // "ru-RU,ru;q=0.9,en;q=0.8" -> first tag we actually serve.
  const header = request.headers.get('accept-language') ?? '';
  for (const part of header.split(',')) {
    const tag = part.split(';')[0]?.trim().slice(0, 2).toLowerCase() ?? '';
    if (isLocale(tag)) return tag;
  }
  return DEFAULT_LOCALE;
}

/** The domain root is the landing; the storefront lives under its locale (`/ru`, `/uz`). */
const LANDING_ONLY = process.env.LANDING_ONLY === '1';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const [, first = ''] = pathname.split('/');

  if (LANDING_ONLY && pathname === '/') {
    const url = request.nextUrl.clone();
    url.pathname = `/${preferredLocale(request)}/promo`;
    return NextResponse.redirect(url);
  }

  if (isLocale(first)) {
    // Remember the choice so the next bare URL lands in the same language.
    const response = NextResponse.next();
    if (request.cookies.get(COOKIE)?.value !== first) {
      response.cookies.set(COOKIE, first, { path: '/', maxAge: 60 * 60 * 24 * 365 });
    }
    return response;
  }

  const url = request.nextUrl.clone();
  url.pathname = `/${preferredLocale(request)}${pathname === '/' ? '' : pathname}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except Next internals and files with an extension.
  matcher: ['/((?!_next|api|.*\\.[\\w]+$).*)'],
};
