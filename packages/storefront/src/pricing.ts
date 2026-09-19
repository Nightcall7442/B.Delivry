/**
 * Delivery estimate for the storefront: fee and ETA from straight-line distance.
 *
 * ponytail: the API's fee calculator (zones, surge, vehicle) is the source of
 * truth; this is the number shown before an order exists. Replace with
 * `api.delivery.quote()` once the client lands — same return shape.
 */
import {
  CASHBACK,
  HEAVY_ORDER_GRAMS,
  HEAVY_SURCHARGE_MINOR,
  VEHICLE_AVG_SPEED_KMH,
} from '@bazar/constants';
import { haversineMeters } from '@bazar/maps';
import type { LatLngDto, MoneyDto } from '@bazar/types';

export interface DeliveryEstimate {
  fee: MoneyDto;
  distanceMeters: number;
  etaMinutes: number;
}

// Mirrors the seeded default tariff (apps/api/prisma/seed.ts) so the cart and
// the checkout quote agree to the rounding; the API remains the truth.
const BASE_FEE = 8_000_00; // tiyin
const PER_KM = 1_500_00;
const FREE_KM = 1;
const ROUND_TO = 100_00;
/** Basket size from which delivery is free in the default zone. */
export const FREE_DELIVERY_THRESHOLD: MoneyDto = { amount: 200_000_00, currency: 'UZS' };

/** How far a basket is from free delivery: 0..1 filled, and what is left to add. */
export function freeDeliveryProgress(
  subtotal: number,
  threshold: MoneyDto | null = FREE_DELIVERY_THRESHOLD,
): { ratio: number; remaining: number; reached: boolean } | null {
  if (threshold === null || threshold.amount <= 0) return null;
  const remaining = Math.max(0, threshold.amount - subtotal);
  return { ratio: Math.min(1, subtotal / threshold.amount), remaining, reached: remaining === 0 };
}

/** What the cart knows about one store's basket before the API has priced it. */
export interface BasketEstimateInput {
  subtotal?: number;
  /** The store's own threshold (minor units); null/undefined → the default zone's. */
  freeDeliveryThreshold?: number | null;
  /** Past HEAVY_ORDER_GRAMS the trip needs a car — the same surcharge the API adds. */
  weightGrams?: number;
}

/** Grams a basket weighs: the product's weight per unit times the quantity (0 when unknown). */
export const basketGrams = (
  lines: ReadonlyArray<{ product: { weightGrams: number | null }; quantity: number }>,
): number => lines.reduce((sum, line) => sum + (line.product.weightGrams ?? 0) * line.quantity, 0);

export function estimateDelivery(
  from: LatLngDto,
  to: LatLngDto,
  preparationMinutes: number,
  basket: BasketEstimateInput = {},
): DeliveryEstimate {
  const distanceMeters = haversineMeters(from, to);
  const km = distanceMeters / 1000;
  const raw = BASE_FEE + Math.max(0, km - FREE_KM) * PER_KM;
  const threshold = basket.freeDeliveryThreshold ?? FREE_DELIVERY_THRESHOLD.amount;
  const ride = (basket.subtotal ?? 0) >= threshold ? 0 : Math.round(raw / ROUND_TO) * ROUND_TO;
  // A sack of flour rides in a car: never waived, whatever the basket size.
  const heavy = (basket.weightGrams ?? 0) > HEAVY_ORDER_GRAMS ? HEAVY_SURCHARGE_MINOR : 0;
  const fee = ride + heavy;
  // Straight line is shorter than streets: 1.3 is the usual city detour factor.
  const rideMinutes = ((km * 1.3) / VEHICLE_AVG_SPEED_KMH.SCOOTER) * 60;
  return {
    fee: { amount: fee, currency: 'UZS' },
    distanceMeters,
    etaMinutes: Math.ceil(preparationMinutes + rideMinutes + 5),
  };
}

/** What comes back to the balance for a price: CASHBACK.PERCENT, in tiyin, rounded down to a sum. */
export function cashbackFor(priceMinor: number): number {
  return Math.floor((priceMinor * CASHBACK.PERCENT) / 100 / 100) * 100;
}
