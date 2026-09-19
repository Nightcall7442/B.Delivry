/**
 * DeliveryFeeCalculator interface (distance, zone, weight, time-of-day).
 */
import { HEAVY_ORDER_GRAMS, HEAVY_SURCHARGE_MINOR } from '@bazar/constants';
import {
  add,
  clampToZero,
  compare,
  money,
  multiply,
  percentage,
  subtract,
  zero,
} from '@bazar/payments';
import type { Money } from '@bazar/payments';
import { minutesOfDay, tashkentParts } from '@bazar/utils';
import type { Quote, QuoteInput, SurgeRule, Tariff } from '../types/index.js';

export interface DeliveryFeeCalculator {
  quote(input: QuoteInput): Quote;
}

/**
 * The whole pricing rule, in one readable place:
 *
 *   fee  = base + perKm * max(0, distance - freeDistance)
 *   fee  = fee * surge
 *   fee  = clamp(fee, minFee, maxFee)
 *   fee  = 0 when the subtotal clears freeDeliveryThreshold
 *   total = subtotal + fee + serviceFee - discount
 *
 * Every step works in integer minor units, so no rounding drift can appear
 * between what the customer was quoted and what they are charged.
 */
export class TariffFeeCalculator implements DeliveryFeeCalculator {
  quote(input: QuoteInput): Quote {
    const { tariff, subtotal } = input;
    const at = input.at ?? new Date();

    const surgeMultiplier = surgeFor(input.surgeRules ?? [], at);
    const chargeableMeters = Math.max(0, input.distanceMeters - tariff.freeDistanceMeters);

    // perKm is a price per kilometre, and distance is in metres.
    const distanceFee = multiply(tariff.perKm, chargeableMeters / 1000);
    const rawFee = multiply(add(tariff.base, distanceFee), surgeMultiplier);

    // What the ride is worth before anyone waives it: the courier's payout base.
    const courierFee = clamp(rawFee, tariff.minFee, tariff.maxFee);
    let deliveryFee = courierFee;

    // Cross-bazaar: the whole trip's goods count towards free delivery, not one stall's.
    const freeByThreshold =
      tariff.freeDeliveryThreshold !== null &&
      compare(input.thresholdSubtotal ?? subtotal, tariff.freeDeliveryThreshold) >= 0;

    if (freeByThreshold || input.freeDelivery === true) {
      deliveryFee = zero(subtotal.currency);
    }

    // A sack of flour rides in a car: the surcharge is never waived, and the courier is paid for it.
    const heavy = (input.weightGrams ?? 0) > HEAVY_ORDER_GRAMS;
    const heavySurcharge = heavy
      ? money(HEAVY_SURCHARGE_MINOR, subtotal.currency)
      : zero(subtotal.currency);
    deliveryFee = add(deliveryFee, heavySurcharge);
    const courierFeeTotal = add(courierFee, heavySurcharge);

    const discount = input.discount ?? zero(subtotal.currency);
    const gross = add(add(subtotal, deliveryFee), tariff.serviceFee);
    // A discount larger than the order must not produce a negative charge.
    const total = clampToZero(subtract(gross, discount));

    const belowMinimum = compare(subtotal, tariff.minOrder) < 0;

    return {
      deliverable: !belowMinimum,
      distanceMeters: input.distanceMeters,
      deliveryFee,
      courierFee: courierFeeTotal,
      serviceFee: tariff.serviceFee,
      discount,
      subtotal,
      total,
      surgeMultiplier,
      minOrder: tariff.minOrder,
      freeDeliveryThreshold: tariff.freeDeliveryThreshold,
      commission: percentage(subtotal, tariff.commissionPercent),
      reason: belowMinimum ? 'Order is below the minimum for this zone' : null,
      heavy,
      heavySurcharge,
    };
  }
}

function clamp(value: Money, min: Money, max: Money | null): Money {
  if (compare(value, min) < 0) return min;
  if (max !== null && compare(value, max) > 0) return max;
  return value;
}

/**
 * Highest matching multiplier wins, so overlapping rules (evening rush plus
 * a weekend rule) do not compound into an absurd price.
 */
export function surgeFor(rules: readonly SurgeRule[], at: Date): number {
  const { weekday } = tashkentParts(at);
  const minute = minutesOfDay(at);

  let multiplier = 1;
  for (const rule of rules) {
    const dayMatches = rule.weekdays.length === 0 || rule.weekdays.includes(weekday);
    if (!dayMatches) continue;
    // A window that wraps past midnight (22:00-02:00) matches either side.
    const inWindow =
      rule.fromMinute <= rule.toMinute
        ? minute >= rule.fromMinute && minute < rule.toMinute
        : minute >= rule.fromMinute || minute < rule.toMinute;
    if (inWindow && rule.multiplier > multiplier) multiplier = rule.multiplier;
  }
  return multiplier;
}

/** What the courier earns. Kept next to the fee so the split stays visible. */
export function courierPayout(deliveryFee: Money, sharePercent = 80): Money {
  return percentage(deliveryFee, sharePercent);
}

export function emptyTariff(currency: string): Tariff {
  const none = money(0, currency as Money['currency']);
  return {
    id: 'none',
    name: 'none',
    cityId: null,
    base: none,
    perKm: none,
    freeDistanceMeters: 0,
    minFee: none,
    maxFee: null,
    commissionPercent: 0,
    serviceFee: none,
    freeDeliveryThreshold: null,
    minOrder: none,
  };
}
