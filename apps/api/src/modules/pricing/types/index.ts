/**
 * Pricing module-internal types & DTOs.
 */
import type { Money } from '@bazar/payments';

export interface Tariff {
  id: string;
  name: string;
  cityId: string | null;
  base: Money;
  perKm: Money;
  freeDistanceMeters: number;
  minFee: Money;
  maxFee: Money | null;
  commissionPercent: number;
  serviceFee: Money;
  freeDeliveryThreshold: Money | null;
  minOrder: Money;
}

export interface SurgeRule {
  id: string;
  weekdays: number[];
  fromMinute: number;
  toMinute: number;
  multiplier: number;
}

export interface QuoteInput {
  tariff: Tariff;
  distanceMeters: number;
  subtotal: Money;
  /** Local time the quote is for; drives surge. Defaults to now. */
  at?: Date;
  surgeRules?: readonly SurgeRule[];
  /** Discount already computed by the promotions module. */
  discount?: Money;
  freeDelivery?: boolean;
  /** Subtotal the free-delivery threshold is measured against; the order's own by default. */
  thresholdSubtotal?: Money | undefined;
  /** Goods weight; over HEAVY_ORDER_GRAMS the car surcharge applies. */
  weightGrams?: number | undefined;
}

export interface Quote {
  deliverable: boolean;
  distanceMeters: number;
  deliveryFee: Money;
  /** The fee before free-delivery rules: what the courier is paid from. */
  courierFee: Money;
  serviceFee: Money;
  discount: Money;
  subtotal: Money;
  total: Money;
  surgeMultiplier: number;
  minOrder: Money;
  /** Basket size from which delivery is free in this zone; null when the tariff has none. */
  freeDeliveryThreshold: Money | null;
  /** Platform cut of the goods, held back from the vendor payout. */
  commission: Money;
  reason: string | null;
  heavy: boolean;
  heavySurcharge: Money;
}
