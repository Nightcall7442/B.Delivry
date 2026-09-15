/**
 * i18n bootstrap using @bazar/i18n (uz/ru/en).
 *
 * Until the message catalogues land, this is the one piece the screens actually
 * need: picking a string out of a Translated field. Falling back to *some*
 * language beats rendering an empty product name.
 */
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, isLocale, type Locale } from '@bazar/constants';
import type { Translated } from '@bazar/types';

export function toLocale(value: string | undefined): Locale {
  return value && isLocale(value) ? value : DEFAULT_LOCALE;
}

/** Requested locale, then the other supported ones, then whatever is there. */
export function tr(value: Translated | null | undefined, locale: string): string {
  if (!value) return '';
  const wanted = toLocale(locale);
  const direct = value[wanted];
  if (direct) return direct;
  for (const candidate of SUPPORTED_LOCALES) {
    const text = value[candidate];
    if (text) return text;
  }
  return Object.values(value).find(Boolean) ?? '';
}
