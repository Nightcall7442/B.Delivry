/**
 * Weighed goods: when the bill may still be corrected, and by how much.
 */
import { ORDER_STATUS, PRODUCT_UNIT, type OrderStatus, type ProductUnit } from '@bazar/constants';

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
