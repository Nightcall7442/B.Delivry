/**
 * «Индекс базара» — our own figure, published weekly: what the staples cost in the bazaar rows of
 * a city today, how that moved since last week, and what the shops ask for the same. Nobody else
 * has the rows' prices; we have them every day, from the stalls themselves.
 *
 * A good counts for a basket item by its Russian name and its unit (a kilo of potatoes, not a
 * sack); the price of an item is the middle one among the goods, so one greedy or one desperate
 * stall moves nothing. Pure: the API feeds it the goods and their price history.
 */
import type { Currency, ProductUnit } from '@bazar/constants';
import type { T } from '@bazar/i18n';
import type { PriceIndexDto, PriceIndexItemDto, Translated } from '@bazar/types';

export interface BasketItem {
  key: string;
  title: Translated;
  per: Translated;
  /** Against the Russian name, lower-cased with ё as е: the start of it. */
  name: RegExp;
  units: readonly ProductUnit[];
}

const KG: Translated = { ru: 'кг', uz: 'kg', en: 'kg' };
const PIECE: Translated = { ru: 'шт', uz: 'dona', en: 'pc' };

/** What a household buys every week, as the bazaar sells it. */
export const BAZAAR_BASKET: readonly BasketItem[] = [
  {
    key: 'potatoes',
    title: { ru: 'Картофель', uz: 'Kartoshka', en: 'Potatoes' },
    per: KG,
    name: /^карто(ф|ш)/,
    units: ['KG'],
  },
  {
    key: 'onions',
    title: { ru: 'Лук', uz: 'Piyoz', en: 'Onions' },
    per: KG,
    name: /^лук(?![а-я])/,
    units: ['KG'],
  },
  {
    key: 'carrots',
    title: { ru: 'Морковь', uz: 'Sabzi', en: 'Carrots' },
    per: KG,
    name: /^морков/,
    units: ['KG'],
  },
  {
    key: 'tomatoes',
    title: { ru: 'Помидоры', uz: 'Pomidor', en: 'Tomatoes' },
    per: KG,
    name: /^(помидор|томат)/,
    units: ['KG'],
  },
  {
    key: 'cucumbers',
    title: { ru: 'Огурцы', uz: 'Bodring', en: 'Cucumbers' },
    per: KG,
    name: /^огур/,
    units: ['KG'],
  },
  {
    key: 'herbs',
    title: { ru: 'Зелень', uz: 'Koʻkatlar', en: 'Herbs' },
    per: { ru: 'пучок', uz: 'bogʻ', en: 'bunch' },
    name: /^зелень/,
    units: ['PCS'],
  },
  {
    key: 'beef',
    title: { ru: 'Говядина', uz: 'Mol goʻshti', en: 'Beef' },
    per: KG,
    name: /^говядин/,
    units: ['KG'],
  },
  {
    key: 'mutton',
    title: { ru: 'Баранина', uz: 'Qoʻy goʻshti', en: 'Mutton' },
    per: KG,
    name: /^баранин/,
    units: ['KG'],
  },
  {
    key: 'chicken',
    title: { ru: 'Курица', uz: 'Tovuq', en: 'Chicken' },
    per: KG,
    name: /^(куриц|цыпл)/,
    units: ['KG'],
  },
  {
    key: 'rice',
    title: { ru: 'Рис', uz: 'Guruch', en: 'Rice' },
    per: KG,
    name: /^рис(?![а-я])/,
    units: ['KG'],
  },
  {
    key: 'eggs',
    title: { ru: 'Яйца', uz: 'Tuxum', en: 'Eggs' },
    per: { ru: '10 шт', uz: '10 dona', en: '10 pcs' },
    name: /^яйц(.*[^\d])?10\s*шт/,
    units: ['PCS', 'PACK'],
  },
  {
    key: 'bread',
    title: { ru: 'Лепёшка', uz: 'Non', en: 'Flatbread' },
    per: PIECE,
    name: /^(лепешк|об[иі] нон|нон(?![а-я]))/,
    units: ['PCS'],
  },
];

const normalized = (name: string): string => name.trim().toLowerCase().replace(/ё/g, 'е');

/** The basket item a good counts for, by its Russian name and unit; null for anything else. */
export function basketItemOf(nameRu: string, unit: ProductUnit): BasketItem | null {
  const name = normalized(nameRu);
  return BAZAAR_BASKET.find((item) => item.units.includes(unit) && item.name.test(name)) ?? null;
}

/** The middle value; the mean of the two middle ones, rounded, for an even count. */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
}

/** A good on sale somewhere in the city, with what its price was. */
export interface IndexedGood {
  nameRu: string;
  unit: ProductUnit;
  /** The price today. */
  price: number;
  currency: string;
  storeId: string;
  /** A shop's shelf rather than a bazaar row (`isShopfront`). */
  shop: boolean;
  createdAt: Date;
  /** Every recorded price, any order. */
  history: readonly { price: number; validFrom: Date }[];
}

/**
 * The good's price at `at`: the last one recorded by then; the first one recorded when the good
 * was already there before its history starts; today's when it was never changed. Null before
 * the good was put on sale.
 */
export function priceAt(good: IndexedGood, at: Date): number | null {
  if (good.createdAt.getTime() > at.getTime()) return null;
  let before: { price: number; validFrom: Date } | null = null;
  let first: { price: number; validFrom: Date } | null = null;
  for (const row of good.history) {
    const t = row.validFrom.getTime();
    if (t <= at.getTime() && (before === null || t >= before.validFrom.getTime())) before = row;
    if (first === null || t < first.validFrom.getTime()) first = row;
  }
  return before?.price ?? first?.price ?? good.price;
}

const WEEK_MS = 7 * 86_400_000;
/** «Дешевле магазинов» is said over at least this many staples, never over one loaf. */
export const MIN_COMPARED = 3;
const oneDecimal = (value: number): number => Math.round(value * 10) / 10;
const mean = (values: readonly number[]): number | null =>
  values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;

/** The index of one city from its goods. Items no bazaar row sells are left out. */
export function buildPriceIndex(
  goods: readonly IndexedGood[],
  {
    now = new Date(),
    weeks = 8,
    currency,
    city = null,
  }: {
    now?: Date;
    weeks?: number;
    currency: Currency;
    city?: PriceIndexDto['city'];
  },
): Omit<PriceIndexDto, 'cities'> {
  const byItem = new Map<string, IndexedGood[]>();
  for (const good of goods) {
    if (good.currency !== currency) continue;
    const item = basketItemOf(good.nameRu, good.unit);
    if (item === null) continue;
    byItem.set(item.key, [...(byItem.get(item.key) ?? []), good]);
  }

  const weekAgo = new Date(now.getTime() - WEEK_MS);
  const items: PriceIndexItemDto[] = [];
  for (const item of BAZAAR_BASKET) {
    const all = byItem.get(item.key) ?? [];
    const rows = all.filter((good) => !good.shop);
    const today = rows.map((good) => good.price);
    const middle = median(today);
    if (middle === null) continue;

    // The week's move over the same goods, so a new stall does not pass for a rise.
    const both = rows.filter((good) => priceAt(good, weekAgo) !== null);
    const before = median(both.map((good) => priceAt(good, weekAgo)!));
    const after = median(both.map((good) => good.price));
    const changePercent =
      before === null || after === null || before === 0
        ? null
        : oneDecimal((after / before - 1) * 100);

    items.push({
      key: item.key,
      title: item.title,
      per: item.per,
      median: middle,
      min: Math.min(...today),
      max: Math.max(...today),
      stalls: new Set(rows.map((good) => good.storeId)).size,
      weekAgo: before,
      changePercent,
      shops: median(all.filter((good) => good.shop).map((good) => good.price)),
      weeks: Array.from({ length: weeks }, (_, i) => {
        const at = new Date(now.getTime() - (weeks - 1 - i) * WEEK_MS);
        return median(
          rows.map((good) => priceAt(good, at)).filter((price): price is number => price !== null),
        );
      }),
    });
  }

  const compared = items.filter((item) => item.shops !== null && item.shops > 0);
  const cheaper =
    compared.length < MIN_COMPARED
      ? null
      : mean(compared.map((item) => (1 - item.median / item.shops!) * 100));
  const moved = mean(
    items.map((item) => item.changePercent).filter((change): change is number => change !== null),
  );
  return {
    asOf: now.toISOString(),
    city,
    currency,
    items,
    cheaperThanShopsPercent: cheaper === null ? null : Math.round(cheaper),
    weekChangePercent: moved === null ? null : oneDecimal(moved),
  };
}

/** Which way a price went: under half a percent is no move worth an arrow. */
export type Trend = 'up' | 'down' | 'flat';

export const trendOf = (changePercent: number | null): Trend =>
  changePercent === null || Math.abs(changePercent) < 0.5
    ? 'flat'
    : changePercent > 0
      ? 'up'
      : 'down';

/**
 * The weekly line of an item in a `width`×`height` box, as an SVG path: weeks nobody sold it are
 * stepped over, a flat line sits in the middle. Null when fewer than two weeks are known.
 */
export function sparkPath(
  weeks: readonly (number | null)[],
  width: number,
  height: number,
  pad = 2,
): string | null {
  const known = weeks
    .map((price, i) => ({ price, i }))
    .filter((point): point is { price: number; i: number } => point.price !== null);
  if (known.length < 2) return null;
  const low = Math.min(...known.map((point) => point.price));
  const high = Math.max(...known.map((point) => point.price));
  const step = (width - pad * 2) / Math.max(weeks.length - 1, 1);
  const y = (price: number) =>
    high === low ? height / 2 : pad + (1 - (price - low) / (high - low)) * (height - pad * 2);
  return known
    .map(
      (point, n) =>
        `${n === 0 ? 'M' : 'L'}${(pad + point.i * step).toFixed(1)} ${y(point.price).toFixed(1)}`,
    )
    .join(' ');
}

/** «+3,3 %», «−2 %», «без изменений»: a move in the language's own decimal mark. */
export function changeText(t: T, changePercent: number | null): string {
  const trend = trendOf(changePercent);
  if (trend === 'flat' || changePercent === null) return t('prices.flat');
  // Not Intl: a browser without Uzbek data writes «3.3» where the server wrote «3,3».
  const percent = String(Math.abs(changePercent));
  return t(trend === 'up' ? 'prices.up' : 'prices.down', {
    percent: t.locale === 'en' ? percent : percent.replace('.', ','),
  });
}
