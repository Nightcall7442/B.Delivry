/**
 * t('cart.title') / t.n('cart.items', 3). Missing keys fall back to Russian,
 * then to the key itself — a typo shows on screen instead of crashing.
 */
import { isLocale, type Currency, type Locale } from '@bazar/constants';
import { formatMoney } from '@bazar/utils/money';

import { ru } from './messages/ru.js';
import type { Catalogue, CountKey, MessageKey } from './messages/types.js';
import { uz } from './messages/uz.js';

export const MESSAGES: Record<Locale, Catalogue> = { ru, uz, en: {} };

/** Locales the UI actually speaks; `en` stays a URL until its catalogue exists. */
export const UI_LOCALES: readonly Locale[] = ['ru', 'uz'];

export type Params = Record<string, string | number>;

export interface T {
  (key: MessageKey, params?: Params): string;
  /** Picks the plural form for `count` and fills `{count}`. */
  n(key: CountKey, count: number, params?: Params): string;
  /** formatMoney in this language's digits and currency word. */
  money(minor: number, currency?: Currency): string;
  /** A weight or count with the language's decimal mark: 1,04 — never 1.04. */
  qty(value: number): string;
  /** "12 октября" / "12 oktabr": browsers lack Uzbek month names, so the catalogue carries them. */
  date(value: string | Date): string;
  locale: Locale;
}

const NUMBER_LOCALE: Record<Locale, string> = { ru: 'ru-RU', uz: 'uz-Latn-UZ', en: 'en-US' };

function category(locale: Locale, count: number): 'one' | 'few' | 'many' | 'other' {
  if (locale === 'uz') return 'other';
  if (locale === 'en') return count === 1 ? 'one' : 'other';
  const mod100 = count % 100;
  if (mod100 >= 11 && mod100 <= 14) return 'many';
  const mod10 = count % 10;
  if (mod10 === 1) return 'one';
  if (mod10 >= 2 && mod10 <= 4) return 'few';
  return 'many';
}

// Every catalogue, ru included, is read through the loose shape.
const RU: Catalogue = ru;

const fill = (text: string, params?: Params): string =>
  params === undefined
    ? text
    : text.replace(/\{(\w+)\}/g, (match, name: string) =>
        name in params ? String(params[name]) : match,
      );

export function createT(locale: string): T {
  const loc: Locale = isLocale(locale) ? locale : 'ru';
  const own = MESSAGES[loc];
  const t = ((key: MessageKey, params?: Params) => fill(own[key] ?? RU[key] ?? key, params)) as T;
  t.n = (key, count, params) => {
    const form = `${key}.${category(loc, count)}` as keyof Catalogue;
    const other = `${key}.other` as keyof Catalogue;
    const ruForm = `${key}.${category('ru', count)}` as keyof Catalogue;
    return fill(own[form] ?? own[other] ?? RU[ruForm] ?? key, { count, ...params });
  };
  t.money = (minor, currency) => formatMoney(minor, currency, NUMBER_LOCALE[loc]);
  const qty = new Intl.NumberFormat(NUMBER_LOCALE[loc], { maximumFractionDigits: 2 });
  t.qty = (value) => qty.format(value);
  t.date = (value) => {
    const at = typeof value === 'string' ? new Date(value) : value;
    const months = (own['months'] ?? RU['months'] ?? '').split(',');
    return `${at.getDate()} ${months[at.getMonth()] ?? ''}`;
  };
  t.locale = loc;
  return t;
}
