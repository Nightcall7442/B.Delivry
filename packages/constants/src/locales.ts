/**
 * SUPPORTED_LOCALES: uz | ru | en; DEFAULT_LOCALE.
 */
export const SUPPORTED_LOCALES = ['uz', 'ru', 'en'] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'uz';

export const isLocale = (value: unknown): value is Locale =>
  typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value);
