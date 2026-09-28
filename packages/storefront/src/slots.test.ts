import { describe, expect, it } from 'vitest';

import { deliverySlots, isOpenAt, slotLabel } from './slots.js';

/** A stall: every day 06:30–18:00. */
const stall = {
  status: 'ACTIVE' as const,
  schedule: Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    opensAt: 6 * 60 + 30,
    closesAt: 18 * 60,
    closed: false,
  })),
};
/** Tashkent wall-clock → the instant (UTC+5 all year). */
const tashkent = (iso: string) => new Date(`${iso}+05:00`);
const hours = (slots: ReturnType<typeof deliverySlots>) =>
  slots.map((slot) => `${slot.day} ${new Date(slot.startsAt).getUTCHours() + 5}`);

describe('isOpenAt', () => {
  it('reads the store’s own hours on Tashkent’s clock, to the minute', () => {
    expect(isOpenAt(stall, tashkent('2026-09-29T06:29'))).toBe(false);
    expect(isOpenAt(stall, tashkent('2026-09-29T06:30'))).toBe(true);
    expect(isOpenAt(stall, tashkent('2026-09-29T17:59'))).toBe(true);
    expect(isOpenAt(stall, tashkent('2026-09-29T18:00'))).toBe(false);
  });

  it('is shut on a closed day and when the store is not active', () => {
    const sunday = {
      ...stall,
      schedule: stall.schedule.map((row) => (row.weekday === 0 ? { ...row, closed: true } : row)),
    };
    expect(isOpenAt(sunday, tashkent('2026-09-27T10:00'))).toBe(false);
    expect(isOpenAt({ ...stall, status: 'SUSPENDED' }, tashkent('2026-09-29T10:00'))).toBe(false);
  });
});

describe('deliverySlots', () => {
  it('offers only the windows the stall can serve: never 18:00 from a row that shuts at six', () => {
    expect(hours(deliverySlots(tashkent('2026-09-29T03:27'), 'ru', [stall]))).toEqual([
      'today 8',
      'today 12',
      'tomorrow 8',
      'tomorrow 12',
    ]);
  });

  it('keeps 90 minutes of notice', () => {
    expect(hours(deliverySlots(tashkent('2026-09-29T10:30'), 'ru', [stall]))[0]).toBe('today 12');
    expect(hours(deliverySlots(tashkent('2026-09-29T10:31'), 'ru', [stall]))[0]).toBe('tomorrow 8');
  });

  it('counts hours in Tashkent whatever the zone of the device', () => {
    // 23:30 UTC is already 04:30 of the next Tashkent day.
    const slots = deliverySlots(new Date('2026-09-28T23:30:00Z'), 'ru');
    expect(slots[0]!.startsAt).toBe('2026-09-29T03:00:00.000Z');
    expect(slots[0]!.label).toBe(`${slots[0]!.label.split(' ')[0]} 08:00–10:00`);
  });

  it('asks every stall of a trip', () => {
    const shutAtNoon = {
      ...stall,
      schedule: stall.schedule.map((row) => ({ ...row, closesAt: 12 * 60 })),
    };
    expect(hours(deliverySlots(tashkent('2026-09-29T03:27'), 'ru', [stall, shutAtNoon]))).toEqual([
      'today 8',
      'tomorrow 8',
    ]);
  });
});

describe('slotLabel', () => {
  it('names the window in Tashkent time, today or tomorrow', () => {
    const now = tashkent('2026-09-29T03:27');
    expect(slotLabel(tashkent('2026-09-29T08:00').toISOString(), 'ru', now)).toMatch(
      /08:00–10:00$/,
    );
    expect(slotLabel(tashkent('2026-09-30T12:00').toISOString(), 'ru', now)).toMatch(
      /12:00–14:00$/,
    );
    expect(slotLabel(tashkent('2026-09-29T08:00').toISOString(), 'ru', now)).not.toBe(
      slotLabel(tashkent('2026-09-30T08:00').toISOString(), 'ru', now),
    );
  });
});
