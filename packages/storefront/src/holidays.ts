/**
 * Holiday modes: for a week (or a month) the home screen leads with the
 * holiday table instead of the morning-delivery promo, and the matching set
 * goes first in the bundle rail. Navruz is a fixed date; Ramadan and Kurban
 * follow the lunar calendar, so their windows are a table per year.
 * ponytail: two years of dates inline — move to admin config when ops want
 * to set them without a release.
 */
import type { Translated } from '@bazar/types';

import { BUNDLES, HOLIDAY_BUNDLES, OCCASION_BUNDLES, type Bundle } from './bundles.js';

export type HolidayKey = 'navruz' | 'ramadan' | 'kurban';

export interface Holiday {
  key: HolidayKey;
  /** Inclusive Tashkent dates, YYYY-MM-DD. */
  from: string;
  to: string;
  title: Translated;
  hint: Translated;
  bundleSlug: string;
}

const CONTENT: Record<HolidayKey, Pick<Holiday, 'title' | 'hint' | 'bundleSlug'>> = {
  navruz: {
    title: { ru: 'Навруз муборак!', uz: 'Navroʻz muborak!', en: 'Happy Navruz!' },
    hint: {
      ru: 'Зелень для кук-самсы, орехи и лепёшки — стол к 21 марта соберём мы.',
      uz: 'Koʻk somsaga koʻkat, yongʻoq va non — 21 mart dasturxonini biz yigʻamiz.',
      en: 'Greens for kuk-samsa, walnuts and bread — we lay the table for the 21st.',
    },
    bundleSlug: 'navruz',
  },
  ramadan: {
    title: {
      ru: 'Рамазан: стол к ифтару',
      uz: 'Ramazon: iftorlik dasturxoni',
      en: 'Ramadan: the iftar table',
    },
    hint: {
      ru: 'Заказ до 16:00 — привезём к закату. Лепёшки, молоко, фрукты одним набором.',
      uz: '16:00 gacha buyurtma — shomga yetkazamiz. Non, sut, meva bitta toʻplamda.',
      en: 'Order by 16:00 and it arrives before sunset. Bread, milk and fruit in one set.',
    },
    bundleSlug: 'iftar',
  },
  kurban: {
    title: { ru: 'Курбан хайит', uz: 'Qurbon hayiti', en: 'Kurban Hayit' },
    hint: {
      ru: 'Баранина и говядина с Фархадского к празднику — плов на всю махаллю.',
      uz: 'Bayramga Farhod bozoridan qoʻy va mol goʻshti — butun mahallaga palov.',
      en: 'Lamb and beef from Farkhad for the holiday — plov for the whole mahalla.',
    },
    bundleSlug: 'kurban',
  },
};

/** Windows per year; lunar ones follow the Muslim Board of Uzbekistan (±1 day). */
const DATES: ReadonlyArray<[HolidayKey, string, string]> = [
  ['ramadan', '2026-02-18', '2026-03-20'],
  ['navruz', '2026-03-14', '2026-03-21'],
  ['kurban', '2026-05-20', '2026-05-27'],
  ['ramadan', '2027-02-08', '2027-03-10'],
  ['navruz', '2027-03-14', '2027-03-21'],
  ['kurban', '2027-05-10', '2027-05-17'],
];

export const HOLIDAYS: readonly Holiday[] = DATES.map(([key, from, to]) => ({
  key,
  from,
  to,
  ...CONTENT[key],
}));

/** Today's date in Tashkent as YYYY-MM-DD (device zone if Intl lacks zones). */
export function tashkentDate(now = new Date()): string {
  try {
    return now.toLocaleDateString('en-CA', { timeZone: 'Asia/Tashkent' });
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

/**
 * The holiday on now; when two overlap (Ramadan's end, Navruz), the one ending
 * first. `preview` (a `?holiday=` query) shows a card ahead of its window —
 * marketing checks it before the date.
 */
export function activeHoliday(now = new Date(), preview?: string | null): Holiday | null {
  const today = tashkentDate(now);
  if (preview) return HOLIDAYS.find((h) => h.key === preview && h.to >= today) ?? null;
  return (
    HOLIDAYS.filter((h) => h.from <= today && today <= h.to).sort((a, b) =>
      a.to.localeCompare(b.to),
    )[0] ?? null
  );
}

/** Whole days until the holiday window closes, 0 on its last day. */
export function holidayDaysLeft(holiday: Holiday, now = new Date()): number {
  return Math.round((Date.parse(holiday.to) - Date.parse(tashkentDate(now))) / 86_400_000);
}

/** The bundle rail: the holiday set first while its window is open. */
export function bundlesFor(now = new Date(), preview?: string | null): readonly Bundle[] {
  const holiday = activeHoliday(now, preview);
  const special = holiday ? HOLIDAY_BUNDLES.find((b) => b.slug === holiday.bundleSlug) : undefined;
  return special ? [special, ...BUNDLES, ...OCCASION_BUNDLES] : [...BUNDLES, ...OCCASION_BUNDLES];
}
