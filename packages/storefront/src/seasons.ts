/**
 * What the bazaar is about right now: Tashkent's counters change with the
 * month, and the home hero says so — melons in August, pomegranates in
 * October, the first greens in March. One table, month → season.
 * ponytail: months only; a real feed would come from what vendors mark as
 * arrived today.
 */
import type { Translated } from '@bazar/types';

export interface Season {
  key: string;
  /** 1–12, inclusive on both ends (a range may wrap past December). */
  months: [number, number];
  title: Translated;
  hint: Translated;
  /** A PHOTOS key. */
  photo: string;
  /** Category slug the card opens. */
  category: string;
}

const SEASONS: Season[] = [
  {
    key: 'greens',
    months: [3, 4],
    title: { ru: 'Первая зелень', uz: 'Birinchi koʻkatlar', en: 'The first greens' },
    hint: {
      ru: 'Укроп, кинза, райхон — с грядок Ташкентской области, срезаны на рассвете.',
      uz: 'Ukrop, kashnich, rayhon — Toshkent viloyati tomorqalaridan, tongda oʻrilgan.',
      en: 'Dill, coriander, basil — cut at dawn in the Tashkent region.',
    },
    photo: 'p-greens',
    category: 'vegetables',
  },
  {
    key: 'early',
    months: [5, 6],
    title: {
      ru: 'Первые огурцы и помидоры',
      uz: 'Ilk bodring va pomidor',
      en: 'First cucumbers and tomatoes',
    },
    hint: {
      ru: 'Грунтовые, с запахом ботвы — не тепличные.',
      uz: 'Ochiq yerdan, barg hidi bilan — issiqxonadan emas.',
      en: 'Field-grown, smelling of the vine — not greenhouse.',
    },
    photo: 'p-tomato',
    category: 'vegetables',
  },
  {
    key: 'stone',
    months: [7, 7],
    title: { ru: 'Персики и абрикосы', uz: 'Shaftoli va oʻrik', en: 'Peaches and apricots' },
    hint: {
      ru: 'Самаркандские, спелые — на варенье и просто так.',
      uz: 'Samarqandniki, pishgan — murabboga ham, shunchaga ham.',
      en: 'From Samarkand, ripe — for jam or just like that.',
    },
    photo: 'p-peach',
    category: 'fruits',
  },
  {
    key: 'melon',
    months: [8, 9],
    title: {
      ru: 'Сезон дынь и винограда',
      uz: 'Qovun va uzum mavsumi',
      en: 'Melon and grape season',
    },
    hint: {
      ru: 'Мирзачульская торпеда и хусайне — выберем спелую и довезём целой.',
      uz: 'Mirzachoʻl torpedasi va husayni — pishganini tanlab, butun yetkazamiz.',
      en: 'Mirzachul torpedo and husayne grapes — picked ripe, delivered whole.',
    },
    photo: 'p-melon',
    category: 'fruits',
  },
  {
    key: 'pomegranate',
    months: [10, 11],
    title: { ru: 'Гранаты и хурма', uz: 'Anor va xurmo', en: 'Pomegranates and persimmons' },
    hint: {
      ru: 'Кувинские гранаты с косточкой-рубином — сезон короткий.',
      uz: 'Quva anori, yoqut donali — mavsum qisqa.',
      en: 'Kuva pomegranates with ruby seeds — the season is short.',
    },
    photo: 'p-pomegranate',
    category: 'fruits',
  },
  {
    key: 'dried',
    months: [12, 2],
    title: { ru: 'Орехи и сухофрукты', uz: 'Yongʻoq va quruq mevalar', en: 'Nuts and dried fruit' },
    hint: {
      ru: 'Грецкий орех, изюм, курага — к чаю и в плов.',
      uz: 'Yongʻoq, mayiz, turshak — choyga ham, oshga ham.',
      en: 'Walnuts, raisins, dried apricots — for tea and for plov.',
    },
    photo: 'p-raisin',
    category: 'spices',
  },
];

/** The season for a month (Tashkent time); the first table entry whose range covers it. */
export function currentSeason(now = new Date()): Season {
  const month = now.getMonth() + 1;
  const hit = SEASONS.find(({ months: [from, to] }) =>
    from <= to ? month >= from && month <= to : month >= from || month <= to,
  );
  return hit ?? SEASONS[0]!;
}
