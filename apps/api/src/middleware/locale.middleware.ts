/**
 * Resolve locale (uz/ru/en) from header/user.
 */
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, isLocale, type Locale } from '@bazar/constants';
import type { FastifyInstance, FastifyRequest } from 'fastify';

const LOCALE_HEADER = 'x-locale';

/**
 * Order of preference: what the user chose in their profile, then an explicit
 * header, then Accept-Language, then uz. A courier who set the app to Russian
 * keeps getting Russian even when the phone locale says otherwise.
 */
export function resolveLocale(request: FastifyRequest): Locale {
  const fromUser = request.user?.locale;
  if (fromUser !== undefined && isLocale(fromUser)) return fromUser;

  const header = request.headers[LOCALE_HEADER];
  const explicit = Array.isArray(header) ? header[0] : header;
  if (explicit !== undefined && isLocale(explicit)) return explicit;

  return fromAcceptLanguage(request.headers['accept-language']) ?? DEFAULT_LOCALE;
}

/** Parses "ru-RU,ru;q=0.9,en;q=0.8" and takes the best supported match. */
function fromAcceptLanguage(header: string | undefined): Locale | null {
  if (header === undefined) return null;

  const ranked = header
    .split(',')
    .map((part) => {
      const [tag = '', ...params] = part.trim().split(';');
      const q = params.find((p) => p.trim().startsWith('q='));
      return {
        tag: tag.toLowerCase().split('-')[0] ?? '',
        q: q === undefined ? 1 : Number(q.split('=')[1]),
      };
    })
    .filter((entry) => Number.isFinite(entry.q))
    .sort((a, b) => b.q - a.q);

  for (const entry of ranked) {
    if ((SUPPORTED_LOCALES as readonly string[]).includes(entry.tag)) return entry.tag as Locale;
  }
  return null;
}

export function registerLocale(app: FastifyInstance): void {
  app.addHook('onRequest', async (request, reply) => {
    const locale = resolveLocale(request);
    request.locale = locale;
    void reply.header('content-language', locale);
  });
}
