import type { DeliveryDto } from '@bazar/types';
import { describe, expect, it } from 'vitest';

import {
  dayStart,
  finishedTrips,
  groupTripsByDay,
  paidTrips,
  sumPayout,
  tripTime,
  tripTitle,
} from './courier-history.js';

/** Tashkent wall-clock → the instant (UTC+5 all year). */
const tashkent = (iso: string) => new Date(`${iso}+05:00`);

let seq = 0;
/** A delivered trip that ended at `at` (Tashkent), paying 1000 unless told otherwise. */
const trip = (at: string, over: Partial<DeliveryDto> = {}): DeliveryDto => {
  const when = tashkent(at).toISOString();
  return {
    id: `d${++seq}`,
    tenantId: 't1',
    createdAt: when,
    updatedAt: when,
    orderId: `o${seq}`,
    orderNumber: 'BZ-260929-4KDQ8P',
    storeName: { ru: 'Лавка Азиза' },
    courierId: 'c1',
    courier: null,
    status: 'DELIVERED',
    pickupPoint: null,
    pickupAddress: 'Чорсу, ряд 4',
    dropoffPoint: null,
    dropoffAddress: 'Мирзо Улугбек 12',
    distanceMeters: 3400,
    payout: { amount: 1000, currency: 'UZS' },
    assignedAt: null,
    pickedUpAt: null,
    deliveredAt: over.status === undefined || over.status === 'DELIVERED' ? when : null,
    etaAt: null,
    proofType: 'CODE',
    proofUrl: null,
    handoverCode: null,
    failureReason: null,
    attemptCount: 0,
    ...over,
  };
};

const ended = (at: string, status: DeliveryDto['status']) => trip(at, { status });

describe('finishedTrips', () => {
  it('keeps only trips that are over, newest first whatever the order they came in', () => {
    const early = trip('2026-09-29T09:00');
    const late = trip('2026-09-29T17:00');
    const rows = [
      early,
      ended('2026-09-29T18:00', 'IN_TRANSIT'),
      late,
      ended('2026-09-29T18:30', 'ASSIGNED'),
      ended('2026-09-29T12:00', 'FAILED'),
      ended('2026-09-29T13:00', 'CANCELLED'),
    ];
    expect(finishedTrips(rows).map((row) => row.status)).toEqual([
      'DELIVERED',
      'CANCELLED',
      'FAILED',
      'DELIVERED',
    ]);
    expect(finishedTrips(rows)[0]).toBe(late);
  });

  it('dates a failed trip by the last time its row moved: it has no hand-over stamp', () => {
    const failed = ended('2026-09-28T23:10', 'FAILED');
    expect(failed.deliveredAt).toBeNull();
    expect(finishedTrips([trip('2026-09-28T20:00'), failed])[0]).toBe(failed);
  });

  it('counts a trip once when two pages both carry it', () => {
    const row = trip('2026-09-29T10:00');
    expect(finishedTrips([row, trip('2026-09-29T11:00'), row])).toHaveLength(2);
  });
});

describe('sumPayout', () => {
  it('sums delivered trips only: a failed or cancelled one earns nothing, an unfinished one is not yet', () => {
    const rows = [
      trip('2026-09-29T10:00', { payout: { amount: 1500, currency: 'UZS' } }),
      trip('2026-09-29T11:00', { payout: { amount: 2500, currency: 'UZS' } }),
      ended('2026-09-29T12:00', 'FAILED'),
      ended('2026-09-29T13:00', 'CANCELLED'),
      ended('2026-09-29T14:00', 'PICKED_UP'),
    ];
    expect(sumPayout(rows)).toBe(4000);
    expect(paidTrips(rows)).toHaveLength(2);
    expect(sumPayout([])).toBe(0);
  });

  it('counts from `sinceMs` on, that very instant included', () => {
    const rows = [trip('2026-09-29T00:00'), trip('2026-09-28T23:59:59'), trip('2026-09-27T12:00')];
    const since = tashkent('2026-09-29T00:00').getTime();
    expect(sumPayout(rows, since)).toBe(1000);
    expect(sumPayout(rows, since - 1000)).toBe(2000);
    expect(sumPayout(rows, dayStart(tashkent('2026-09-29T10:00'), 6))).toBe(3000);
  });
});

describe('dayStart', () => {
  it('is midnight UTC+5, not UTC: 19:00 UTC opens the next Tashkent day', () => {
    expect(new Date(dayStart(new Date('2026-09-29T18:59:59.999Z'))).toISOString()).toBe(
      '2026-09-28T19:00:00.000Z',
    );
    expect(new Date(dayStart(new Date('2026-09-29T19:00:00.000Z'))).toISOString()).toBe(
      '2026-09-29T19:00:00.000Z',
    );
  });

  it('steps back whole days', () => {
    expect(new Date(dayStart(tashkent('2026-09-29T10:00'), 6)).toISOString()).toBe(
      '2026-09-22T19:00:00.000Z',
    );
    // Across a month and a year: plain 24-hour days, Tashkent has no DST.
    expect(new Date(dayStart(tashkent('2026-01-02T00:00'), 3)).toISOString()).toBe(
      '2025-12-29T19:00:00.000Z',
    );
  });
});

describe('groupTripsByDay', () => {
  const now = tashkent('2026-09-29T15:00');

  it('names the days Сегодня, Вчера and then by date, newest first, each with its own total', () => {
    const days = groupTripsByDay(
      [
        trip('2026-09-27T09:00', { payout: { amount: 700, currency: 'UZS' } }),
        trip('2026-09-29T10:00'),
        trip('2026-09-28T20:00'),
        trip('2026-09-29T12:00', { payout: { amount: 2000, currency: 'UZS' } }),
        trip('2026-09-28T08:00'),
      ],
      now,
    );
    expect(days.map((day) => [day.key, day.label, day.total, day.trips.length])).toEqual([
      ['2026-09-29', 'Сегодня', 3000, 2],
      ['2026-09-28', 'Вчера', 2000, 2],
      ['2026-09-27', '27 сентября', 700, 1],
    ]);
    expect(days[0]!.trips.map((row) => tripTime(row))).toEqual(['12:00', '10:00']);
  });

  it('cuts the day at midnight in Tashkent, not at midnight UTC', () => {
    // 18:59:59 UTC is 23:59:59 on the 29th here; one second later it is the 30th.
    const before = trip('2026-09-29T23:59:59');
    const after = trip('2026-09-30T00:00:00');
    const days = groupTripsByDay([before, after], tashkent('2026-09-30T08:00'));
    expect(days.map((day) => [day.label, day.trips])).toEqual([
      ['Сегодня', [after]],
      ['Вчера', [before]],
    ]);
  });

  it('turns Сегодня into Вчера the second the Tashkent clock passes midnight', () => {
    const row = trip('2026-09-29T21:00');
    expect(groupTripsByDay([row], tashkent('2026-09-29T23:59:59'))[0]!.label).toBe('Сегодня');
    expect(groupTripsByDay([row], tashkent('2026-09-30T00:00:00'))[0]!.label).toBe('Вчера');
  });

  it('puts the year on a date that is not this year’s', () => {
    const days = groupTripsByDay(
      [trip('2026-01-05T10:00'), trip('2025-12-31T10:00')],
      tashkent('2026-01-07T10:00'),
    );
    expect(days.map((day) => day.label)).toEqual(['5 января', '31 декабря 2025']);
  });

  it('leaves out what is not over, and pays nothing for a day of failures', () => {
    const days = groupTripsByDay(
      [
        ended('2026-09-29T09:00', 'ASSIGNED'),
        ended('2026-09-29T10:00', 'AT_DROPOFF'),
        ended('2026-09-28T10:00', 'FAILED'),
        ended('2026-09-28T11:00', 'CANCELLED'),
      ],
      now,
    );
    expect(days.map((day) => [day.label, day.total, day.trips.length])).toEqual([['Вчера', 0, 2]]);
    expect(groupTripsByDay([], now)).toEqual([]);
  });
});

describe('tripTime', () => {
  it('reads the clock in Tashkent', () => {
    expect(tripTime(trip('2026-09-29T00:00'))).toBe('00:00');
    expect(tripTime(trip('2026-09-29T09:05'))).toBe('09:05');
    expect(tripTime(trip('2026-09-29T23:59'))).toBe('23:59');
  });
});

describe('tripTitle', () => {
  it('names the stall and puts the short order number under it', () => {
    expect(tripTitle(trip('2026-09-29T10:00'))).toEqual({
      title: 'Лавка Азиза',
      number: '№ 4KDQ8P',
    });
  });

  it('falls back to the order number, then to a bare «Заказ», when the stall is unknown', () => {
    expect(tripTitle({ storeName: null, orderNumber: 'BZ-260929-4KDQ8P' })).toEqual({
      title: 'Заказ № 4KDQ8P',
      number: null,
    });
    expect(tripTitle({ storeName: {}, orderNumber: null })).toEqual({
      title: 'Заказ',
      number: null,
    });
    expect(tripTitle({ storeName: { uz: 'Aziz do‘koni' }, orderNumber: null })).toEqual({
      title: 'Aziz do‘koni',
      number: null,
    });
  });
});
