/**
 * What was actually bought: when the bill may still be corrected, and by how much — weighed goods
 * by what a scale shows, and any line short or not at all when the stall did not have it.
 */
import {
  ORDER_STATUS,
  PRODUCT_UNIT,
  WEIGHTED_UNITS,
  type OrderStatus,
  type ProductUnit,
} from '@bazar/constants';

/**
 * The courier is at the stall, buying and weighing. Before this nothing is bought; from PICKED_UP
 * the goods are in the bag and the customer has already been shown what they cost.
 */
export const WEIGHING_STATUSES: readonly OrderStatus[] = [
  ORDER_STATUS.COURIER_ARRIVED_PICKUP,
  ORDER_STATUS.PICKING_UP,
];

/** A scale differs from the order by a handful of grams or a slice more, not by a multiple. */
const OVERRUN_FACTOR = 2;
/** Small orders need room too: 200 g of cheese is cut as 300 g, which is more than half as much again. */
const OVERRUN_FLOOR: Partial<Record<ProductUnit, number>> = {
  [PRODUCT_UNIT.KG]: 1,
  [PRODUCT_UNIT.G]: 1000,
};

/** The most the scale may show for a line ordered as `ordered`, in the line's own unit. */
export function maxActualQuantity(unit: ProductUnit, ordered: number): number {
  return Math.max(ordered * OVERRUN_FACTOR, ordered + (OVERRUN_FLOOR[unit] ?? 0));
}

/** Goods counted in whole pieces: a stall has four flatbreads or five, never four and a half. */
const WHOLE_UNITS: readonly ProductUnit[] = [PRODUCT_UNIT.PCS, PRODUCT_UNIT.PACK, PRODUCT_UNIT.BOX];

/**
 * What the courier may report for a line ordered as `ordered`: a weighed good, anything a scale
 * could show for it; any other good, as much as was ordered or less (whole pieces for pieces).
 * Zero is always allowed — the stall did not have it — and the line leaves the bill.
 */
export function isBuyableQuantity(unit: ProductUnit, ordered: number, actual: number): boolean {
  if (!Number.isFinite(actual) || actual < 0) return false;
  if (WEIGHTED_UNITS.includes(unit)) return actual <= maxActualQuantity(unit, ordered);
  if (WHOLE_UNITS.includes(unit) && !Number.isInteger(actual)) return false;
  return actual <= ordered;
}

/** Where a line stands: the courier's last report for it, else what was ordered. */
export function boughtSoFar(item: { quantity: unknown; actualQuantity?: unknown }): number {
  return item.actualQuantity === null || item.actualQuantity === undefined
    ? Number(item.quantity)
    : Number(item.actualQuantity);
}
