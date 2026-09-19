/**
 * Delivery pricing: the number the customer agreed to pay. Every case here is
 * one somebody would notice on a receipt.
 */
import { money } from '@bazar/payments';
import { describe, expect, it } from 'vitest';
import { TariffFeeCalculator, surgeFor } from '../../src/modules/pricing/domain/fee-calculator.js';
import type { SurgeRule, Tariff } from '../../src/modules/pricing/types/index.js';

const uzs = (amount: number) => money(amount, 'UZS');

const tariff: Tariff = {
  id: 't1',
  name: 'test',
  cityId: null,
  base: uzs(8_000_00),
  perKm: uzs(1_500_00),
  freeDistanceMeters: 1_000,
  minFee: uzs(8_000_00),
  maxFee: uzs(50_000_00),
  commissionPercent: 10,
  serviceFee: uzs(1_000_00),
  freeDeliveryThreshold: uzs(200_000_00),
  minOrder: uzs(20_000_00),
};

const calculator = new TariffFeeCalculator();

describe('delivery fee', () => {
  it('charges only the base within the free distance', () => {
    const quote = calculator.quote({
      tariff,
      distanceMeters: 800,
      subtotal: uzs(50_000_00),
    });

    expect(quote.deliveryFee.amount).toBe(8_000_00);
  });

  it('adds per-km beyond the free distance, not from zero', () => {
    // 3 km travelled, 1 km free => 2 km billed at 1500 = 3000, plus 8000 base.
    const quote = calculator.quote({
      tariff,
      distanceMeters: 3_000,
      subtotal: uzs(50_000_00),
    });

    expect(quote.deliveryFee.amount).toBe(11_000_00);
  });

  it('never charges below the minimum or above the cap', () => {
    const cheap = calculator.quote({
      tariff: { ...tariff, base: uzs(1_00) },
      distanceMeters: 100,
      subtotal: uzs(50_000_00),
    });
    expect(cheap.deliveryFee.amount).toBe(tariff.minFee.amount);

    const far = calculator.quote({ tariff, distanceMeters: 100_000, subtotal: uzs(50_000_00) });
    expect(far.deliveryFee.amount).toBe(tariff.maxFee?.amount);
  });

  it('waives delivery once the basket clears the threshold', () => {
    const quote = calculator.quote({
      tariff,
      distanceMeters: 5_000,
      subtotal: uzs(250_000_00),
    });

    expect(quote.deliveryFee.amount).toBe(0);
    expect(quote.total.amount).toBe(250_000_00 + tariff.serviceFee.amount);
  });

  it('adds the car surcharge past 15 kg and never waives it', () => {
    const light = calculator.quote({
      tariff,
      distanceMeters: 800,
      subtotal: uzs(250_000_00),
      weightGrams: 14_000,
    });
    const heavy = calculator.quote({
      tariff,
      distanceMeters: 800,
      subtotal: uzs(250_000_00),
      weightGrams: 25_000,
    });

    expect(light.heavy).toBe(false);
    expect(light.deliveryFee.amount).toBe(0);
    expect(heavy.heavy).toBe(true);
    // free delivery by threshold, but the sack still rides in a car
    expect(heavy.deliveryFee.amount).toBe(heavy.heavySurcharge.amount);
    expect(heavy.courierFee.amount).toBe(tariff.minFee.amount + heavy.heavySurcharge.amount);
  });

  it('refuses an order below the zone minimum', () => {
    const quote = calculator.quote({ tariff, distanceMeters: 2_000, subtotal: uzs(5_000_00) });

    expect(quote.deliverable).toBe(false);
    expect(quote.reason).not.toBeNull();
  });

  it('never lets a discount produce a negative total', () => {
    const quote = calculator.quote({
      tariff,
      distanceMeters: 2_000,
      subtotal: uzs(25_000_00),
      discount: uzs(999_999_00),
    });

    expect(quote.total.amount).toBe(0);
  });

  it('keeps every amount an integer count of tiyin', () => {
    const quote = calculator.quote({
      tariff,
      distanceMeters: 2_345,
      subtotal: uzs(33_333_33),
      surgeRules: [{ id: 's', weekdays: [], fromMinute: 0, toMinute: 1440, multiplier: 1.7 }],
    });

    for (const amount of [
      quote.deliveryFee.amount,
      quote.serviceFee.amount,
      quote.total.amount,
      quote.commission.amount,
    ]) {
      expect(Number.isInteger(amount)).toBe(true);
    }
  });
});

describe('surge', () => {
  const evening: SurgeRule = {
    id: 's1',
    weekdays: [],
    fromMinute: 18 * 60,
    toMinute: 21 * 60,
    multiplier: 1.5,
  };

  it('applies inside the window and not outside it', () => {
    const at = (hour: number) => {
      // Asia/Tashkent is UTC+5 year-round, so local hour = UTC hour + 5.
      const date = new Date(Date.UTC(2026, 0, 15, hour - 5, 0, 0));
      return surgeFor([evening], date);
    };

    expect(at(19)).toBe(1.5);
    expect(at(12)).toBe(1);
  });

  it('takes the highest matching rule rather than compounding them', () => {
    const overlapping: SurgeRule = { ...evening, id: 's2', multiplier: 2 };
    const date = new Date(Date.UTC(2026, 0, 15, 14, 0, 0));

    expect(surgeFor([evening, overlapping], date)).toBe(2);
  });

  it('handles a window that wraps past midnight', () => {
    const night: SurgeRule = {
      id: 's3',
      weekdays: [],
      fromMinute: 22 * 60,
      toMinute: 2 * 60,
      multiplier: 1.8,
    };

    // 23:00 and 01:00 local are both inside; 12:00 is not.
    expect(surgeFor([night], new Date(Date.UTC(2026, 0, 15, 18, 0, 0)))).toBe(1.8);
    expect(surgeFor([night], new Date(Date.UTC(2026, 0, 15, 20, 0, 0)))).toBe(1.8);
    expect(surgeFor([night], new Date(Date.UTC(2026, 0, 15, 7, 0, 0)))).toBe(1);
  });
});
