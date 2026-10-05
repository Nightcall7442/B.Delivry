/**
 * Quantity prices in words, the same on the app and the site: weighed goods by the kilo — «от 10 кг
 * — 16 000 сум / кг» — counted ones by the set, as the seller typed it — «3 шт за 10 000 сум».
 */
import type { Currency } from '@bazar/constants';
import type { T } from '@bazar/i18n';
import type { ProductDto } from '@bazar/types';

import { unitLabel } from './labels.js';
import { nextTier, setPriceOf, tierReached, tiersOf, type PriceTier } from './tiers.js';
import { isSetPriced } from './vendor-goods.js';

export function tierText(t: T, locale: string, product: ProductDto, tier: PriceTier): string {
  const unit = unitLabel(locale)[product.unit];
  const currency = product.price.currency as Currency;
  return isSetPriced(product.unit)
    ? t('tiers.set', {
        quantity: t.qty(tier.minQuantity),
        unit,
        price: t.money(setPriceOf(tier), currency),
      })
    : t('tiers.from', {
        quantity: t.qty(tier.minQuantity),
        unit,
        price: t.money(tier.price, currency),
      });
}

/** Every step of the good, cheapest last: the lines under its price sign. */
export const tierTexts = (t: T, locale: string, product: ProductDto): string[] =>
  tiersOf(product)
    .filter((tier) => tier.price < product.price.amount)
    .map((tier) => tierText(t, locale, product, tier));

/**
 * What one more step would give at this quantity — «ещё 2 кг — и по 16 000 сум / кг», «возьмите
 * 3 шт — 10 000 сум за все» — or null at the top (or with no steps).
 */
export function nextTierText(
  t: T,
  locale: string,
  product: ProductDto,
  quantity: number,
): string | null {
  const next = nextTier(product.price.amount, tiersOf(product), quantity);
  if (next === null) return null;
  const unit = unitLabel(locale)[product.unit];
  const currency = product.price.currency as Currency;
  return isSetPriced(product.unit)
    ? t('tiers.nextSet', {
        quantity: t.qty(next.minQuantity),
        unit,
        price: t.money(setPriceOf(next), currency),
      })
    : t('tiers.next', {
        more: t.qty(Number((next.minQuantity - quantity).toFixed(3))),
        unit,
        price: t.money(next.price, currency),
      });
}

/** Whether a step prices this quantity below the list price: the line says «оптом». */
export const onTier = (product: ProductDto, quantity: number): boolean => {
  const tier = tierReached(tiersOf(product), quantity);
  return tier !== null && tier.price < product.price.amount;
};
