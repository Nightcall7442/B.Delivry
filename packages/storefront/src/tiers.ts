/**
 * Quantity prices: «от 10 кг — 16 000 сум/кг» for the café that buys by the sack, «3 шт за 10 000»
 * for the stall that wants the third melon gone. One rule for both, shared by the API (which
 * charges it), the clients (which show it) and Bazar Seller (which sets it): from a tier's
 * quantity the whole line is priced at the tier's price per unit — the deepest tier reached, and
 * never above the list price (a sale that cut below a tier wins).
 */
import type { PriceTierDto, ProductDto } from '@bazar/types';

/** Minor units per unit of the product. */
export interface PriceTier {
  minQuantity: number;
  price: number;
}

/** A shelf label, not a price list: more than three steps nobody reads. */
export const MAX_PRICE_TIERS = 3;

export const tiersOf = (product: {
  priceTiers?: readonly PriceTierDto[] | undefined;
}): PriceTier[] =>
  (product.priceTiers ?? []).map((tier) => ({
    minQuantity: tier.minQuantity,
    price: tier.price.amount,
  }));

/** The deepest tier `quantity` reaches, or null. */
export function tierReached(tiers: readonly PriceTier[], quantity: number): PriceTier | null {
  let reached: PriceTier | null = null;
  for (const tier of tiers) {
    if (
      quantity >= tier.minQuantity &&
      (reached === null || tier.minQuantity > reached.minQuantity)
    ) {
      reached = tier;
    }
  }
  return reached;
}

/** The price per unit for `quantity`: the tier reached, never above the list price. */
export function unitPriceFor(
  listPrice: number,
  tiers: readonly PriceTier[],
  quantity: number,
): number {
  const tier = tierReached(tiers, quantity);
  return tier === null ? listPrice : Math.min(listPrice, tier.price);
}

/** A line's total in integer minor units: a 0.5 kg line lands back on an integer. */
export const lineTotalFor = (listPrice: number, tiers: readonly PriceTier[], quantity: number) =>
  Math.round(unitPriceFor(listPrice, tiers, quantity) * quantity);

/** A product's line, from its DTO. */
export const productLineTotal = (product: ProductDto, quantity: number): number =>
  lineTotalFor(product.price.amount, tiersOf(product), quantity);

/** The next step up that would lower the price: «ещё 2 кг — и по 16 000». Null at the top. */
export function nextTier(
  listPrice: number,
  tiers: readonly PriceTier[],
  quantity: number,
): PriceTier | null {
  const now = unitPriceFor(listPrice, tiers, quantity);
  const ahead = tiers
    .filter((tier) => tier.minQuantity > quantity && tier.price < now)
    .sort((a, b) => a.minQuantity - b.minQuantity);
  return ahead[0] ?? null;
}

/** A quantity as the database keeps it, Decimal(10,3): 1.0004 would be stored as 1.000. */
const thousandths = (quantity: number): number => Math.round(quantity * 1000);

/**
 * Why a set of tiers cannot stand, or null when it can: at most three, each from more than the
 * smallest order — in whole units for counted goods, to the thousandth for weighed ones, as the
 * database keeps it — prices falling as the quantity grows, all below the list price. The API
 * refuses on the same answer the seller's sheet shows.
 */
export function tierProblem(
  tiers: readonly PriceTier[],
  product: { price: number; minQuantity: number; whole?: boolean },
): 'tooMany' | 'quantity' | 'price' | 'order' | null {
  if (tiers.length > MAX_PRICE_TIERS) return 'tooMany';
  const sorted = [...tiers].sort((a, b) => a.minQuantity - b.minQuantity);
  for (const [i, tier] of sorted.entries()) {
    if (
      !Number.isFinite(tier.minQuantity) ||
      Math.abs(tier.minQuantity * 1000 - thousandths(tier.minQuantity)) > 1e-6 ||
      (product.whole === true && !Number.isInteger(tier.minQuantity)) ||
      !(tier.minQuantity > product.minQuantity)
    ) {
      return 'quantity';
    }
    if (!Number.isInteger(tier.price) || tier.price <= 0 || tier.price >= product.price) {
      return 'price';
    }
    const before = sorted[i - 1];
    if (
      before !== undefined &&
      (thousandths(tier.minQuantity) === thousandths(before.minQuantity) ||
        tier.price >= before.price)
    ) {
      return 'order';
    }
  }
  return null;
}

/**
 * A set reads back as typed only while the rounding of a piece (under a tiyin) adds up to under a
 * sum: up to a hundred pieces. Beyond it the label is the price of a piece.
 */
export const MAX_SET_PIECES = 100;

/**
 * Counted goods are sold «N шт за X»: the seller types the price of the set, the tier keeps the
 * price of a piece, rounded down so the set never costs more than the label says.
 */
export const piecePriceOfSet = (setPrice: number, pieces: number): number =>
  Math.floor(setPrice / pieces);

/**
 * And back, for the label: the price of the set as the seller typed it. A piece was rounded down
 * by less than a tiyin a piece, so the set is rounded up to the whole sum it was typed in.
 */
export const setPriceOf = (tier: PriceTier, minorDigits = 2): number => {
  const factor = 10 ** minorDigits;
  return Math.ceil((tier.price * tier.minQuantity) / factor) * factor;
};
