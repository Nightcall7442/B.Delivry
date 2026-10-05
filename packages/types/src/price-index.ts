/**
 * «Индекс базара»: what the staples cost in the bazaar rows of a city today, how that moved over
 * the week, and what the shops ask for the same. Figures are integer minor units of `currency`.
 */
import type { Currency } from '@bazar/constants';

import type { Id, IsoDateTime, Translated } from './common.js';

export interface PriceIndexCity {
  id: Id;
  name: Translated;
}

export interface PriceIndexItemDto {
  /** A key of the shared basket: 'potatoes', 'beef'… */
  key: string;
  title: Translated;
  /** What the price is for: «кг», «пучок», «10 шт». */
  per: Translated;
  /** The middle price among the stalls today. */
  median: number;
  min: number;
  max: number;
  /** How many stalls sell it today. */
  stalls: number;
  /** The middle price a week ago, over the goods that were there then too; null when none were. */
  weekAgo: number | null;
  /** From `weekAgo` to today, one decimal; null with `weekAgo`. */
  changePercent: number | null;
  /** The middle price on the shop shelves of the city; null when no shop sells it. */
  shops: number | null;
  /** Weekly middle prices, oldest first, the last one today; null for a week nobody sold it. */
  weeks: (number | null)[];
}

export interface PriceIndexDto {
  asOf: IsoDateTime;
  city: PriceIndexCity | null;
  /** Every city with live stalls, the busiest first: the index can be asked for any of them. */
  cities: PriceIndexCity[];
  currency: Currency;
  items: PriceIndexItemDto[];
  /** On average over the items the shops also sell, how much cheaper the rows are; may be negative. */
  cheaperThanShopsPercent: number | null;
  /** On average over the items, the move since last week. */
  weekChangePercent: number | null;
}
