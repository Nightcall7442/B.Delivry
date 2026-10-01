import { ApiError } from '@bazar/api-client';
import type { HaggleDto } from '@bazar/types';
import { describe, expect, it } from 'vitest';

import {
  answeredAsks,
  askedOffPercent,
  buildSchedule,
  clockMask,
  clockText,
  counterPhotoFresh,
  daysText,
  hoursDraft,
  hoursUneven,
  openAsks,
  parseClock,
  parseCounterPrice,
  revenueWindows,
  stallErrorText,
  storeStatusNote,
  timeLeftText,
  todayHoursText,
  validateHours,
  type ScheduleRow,
} from './vendor-stall.js';

/** Tashkent wall-clock → the instant (UTC+5 all year). */
const tashkent = (iso: string) => new Date(`${iso}+05:00`);

const week = (over: Partial<Record<number, Partial<ScheduleRow>>> = {}): ScheduleRow[] =>
  Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    opensAt: 390,
    closesAt: 1080,
    closed: false,
    ...over[weekday],
  }));

describe('clockText / parseClock / clockMask', () => {
  it('writes minutes as a clock, midnight closing included', () => {
    expect(clockText(0)).toBe('00:00');
    expect(clockText(390)).toBe('06:30');
    expect(clockText(1439)).toBe('23:59');
    expect(clockText(1440)).toBe('24:00');
  });

  it('reads what a seller types', () => {
    expect(parseClock('06:30')).toBe(390);
    expect(parseClock('6:30')).toBe(390);
    expect(parseClock('0630')).toBe(390);
    expect(parseClock('630')).toBe(390);
    expect(parseClock('7')).toBe(420);
    expect(parseClock(' 18:00 ')).toBe(1080);
    expect(parseClock('00:00')).toBe(0);
    expect(parseClock('24:00')).toBe(1440);
  });

  it('refuses what is no time of day', () => {
    for (const bad of [
      '',
      ':',
      '25:00',
      '24:01',
      '12:60',
      '7:5',
      '12:345',
      'утро',
      '-1:00',
      '12.30',
    ]) {
      expect(parseClock(bad), bad).toBeNull();
    }
  });

  it('puts the colon in as the digits come', () => {
    expect(clockMask('0')).toBe('0');
    expect(clockMask('07')).toBe('07');
    expect(clockMask('073')).toBe('07:3');
    expect(clockMask('0730')).toBe('07:30');
    expect(clockMask('07:30')).toBe('07:30');
    expect(clockMask('07:305555')).toBe('07:30');
    expect(clockMask('ab1c')).toBe('1');
  });

  it('is what parseClock reads back', () => {
    for (const minutes of [0, 45, 390, 720, 1080, 1439, 1440]) {
      expect(parseClock(clockMask(clockText(minutes)))).toBe(minutes);
    }
  });
});

describe('todayHoursText', () => {
  // 2026-09-30 is a Wednesday (weekday 3).
  it('reads the row of the Tashkent weekday, not the phone’s', () => {
    const rows = week({ 3: { opensAt: 480, closesAt: 1020 }, 4: { closed: true } });
    expect(todayHoursText(rows, tashkent('2026-09-30T12:00'))).toBe('Сегодня 08:00 – 17:00');
    expect(todayHoursText(rows, tashkent('2026-10-01T12:00'))).toBe('Сегодня выходной');
  });

  it('turns the day over at Tashkent midnight, which is 19:00 UTC', () => {
    const rows = week({ 3: { opensAt: 480, closesAt: 1020 }, 4: { closed: true } });
    expect(todayHoursText(rows, new Date('2026-09-30T18:59:00Z'))).toBe('Сегодня 08:00 – 17:00');
    expect(todayHoursText(rows, new Date('2026-09-30T19:00:00Z'))).toBe('Сегодня выходной');
  });

  it('counts a weekday with no row as a day off, as the API does, and says so when there are no hours at all', () => {
    expect(
      todayHoursText(
        week().filter((row) => row.weekday !== 3),
        tashkent('2026-09-30T12:00'),
      ),
    ).toBe('Сегодня выходной');
    expect(todayHoursText([], tashkent('2026-09-30T12:00'))).toBe('Часы не заданы');
  });
});

describe('hoursDraft', () => {
  it('opens with the first working day’s hours and the working days as they are', () => {
    const draft = hoursDraft(week({ 1: { closed: true }, 2: { opensAt: 420, closesAt: 1020 } }));
    expect(draft).toEqual({
      opens: '07:00',
      closes: '17:00',
      days: [true, false, true, true, true, true, true],
    });
  });

  it('starts a stall that never set hours at the rows’ usual hours, every day', () => {
    expect(hoursDraft([])).toEqual({ opens: '06:30', closes: '18:00', days: Array(7).fill(true) });
  });

  it('keeps the usual hours when every day is off', () => {
    const draft = hoursDraft(week().map((row) => ({ ...row, closed: true })));
    expect(draft.opens).toBe('06:30');
    expect(draft.days.every((on) => !on)).toBe(true);
  });
});

describe('hoursUneven', () => {
  it('is true only when working days keep different hours', () => {
    expect(hoursUneven(week())).toBe(false);
    expect(hoursUneven(week({ 6: { closesAt: 840 } }))).toBe(true);
    // A day off keeping other times is not a difference anyone sees.
    expect(hoursUneven(week({ 6: { closesAt: 840, closed: true } }))).toBe(false);
    expect(hoursUneven([])).toBe(false);
  });
});

describe('buildSchedule / validateHours', () => {
  it('writes seven rows, the same time on each, a day off closed', () => {
    const rows = buildSchedule(390, 1080, [true, false, true, true, true, true, true]);
    expect(rows).toHaveLength(7);
    expect(rows.map((row) => row.weekday)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(rows.every((row) => row.opensAt === 390 && row.closesAt === 1080)).toBe(true);
    expect(rows.filter((row) => row.closed).map((row) => row.weekday)).toEqual([1]);
  });

  it('accepts a sensible day and hands over the week to send', () => {
    const result = validateHours({ opens: '07:30', closes: '18:00', days: Array(7).fill(true) });
    expect(result).toMatchObject({ ok: true });
    if (result.ok)
      expect(result.schedule[0]).toEqual({
        weekday: 0,
        opensAt: 450,
        closesAt: 1080,
        closed: false,
      });
  });

  it('lets a stall trade until midnight', () => {
    const result = validateHours({ opens: '08:00', closes: '24:00', days: Array(7).fill(true) });
    expect(result).toMatchObject({ ok: true });
  });

  it('refuses opening at or after closing — the API would, with less to say', () => {
    for (const [opens, closes] of [
      ['18:00', '07:00'],
      ['10:00', '10:00'],
      ['24:00', '24:00'],
    ]) {
      expect(
        validateHours({ opens: opens!, closes: closes!, days: Array(7).fill(true) }),
      ).toMatchObject({
        ok: false,
      });
    }
  });

  it('refuses a clock that is no clock, and a week with no working day', () => {
    expect(
      validateHours({ opens: '7:5', closes: '18:00', days: Array(7).fill(true) }),
    ).toMatchObject({ ok: false });
    expect(validateHours({ opens: '07:00', closes: '', days: Array(7).fill(true) })).toMatchObject({
      ok: false,
    });
    expect(
      validateHours({ opens: '07:00', closes: '18:00', days: Array(7).fill(false) }),
    ).toMatchObject({ ok: false });
  });
});

describe('daysText', () => {
  const only = (...weekdays: number[]) =>
    Array.from({ length: 7 }, (_, day) => weekdays.includes(day));

  it('says every day, a stretch, or the list', () => {
    expect(daysText(only(0, 1, 2, 3, 4, 5, 6))).toBe('Каждый день');
    expect(daysText(only(1, 2, 3, 4, 5, 6))).toBe('Пн–Сб');
    expect(daysText(only(1, 2, 3, 4, 5))).toBe('Пн–Пт');
    expect(daysText(only(1, 3, 5))).toBe('Пн, Ср, Пт');
    expect(daysText(only(6, 0))).toBe('Сб, Вс');
    expect(daysText(only(2))).toBe('Вт');
    expect(daysText(only())).toBe('Выходной всю неделю');
  });

  it('reads a week with a hole as a list, not a range', () => {
    expect(daysText(only(1, 2, 4, 5))).toBe('Пн, Вт, Чт, Пт');
    // Sunday is the end of the seller's week: a day off on Monday leaves Вт–Вс one stretch.
    expect(daysText(only(2, 3, 4, 5, 6, 0))).toBe('Вт–Вс');
  });
});

describe('counterPhotoFresh', () => {
  const now = tashkent('2026-09-30T15:00');

  it('is today’s photograph, by the Tashkent day', () => {
    expect(counterPhotoFresh('2026-09-30T02:40:00Z', now)).toBe(true); // 07:40 Tashkent
    expect(counterPhotoFresh('2026-09-29T19:00:00Z', now)).toBe(true); // 00:00 Tashkent exactly
    expect(counterPhotoFresh('2026-09-29T18:59:59Z', now)).toBe(false); // 23:59:59 yesterday
  });

  it('is stale when there is none', () => {
    expect(counterPhotoFresh(null, now)).toBe(false);
  });
});

describe('storeStatusNote', () => {
  it('is silent for a live stall and explains every other status', () => {
    expect(storeStatusNote('ACTIVE')).toBeNull();
    for (const status of ['DRAFT', 'PENDING_REVIEW', 'SUSPENDED', 'CLOSED'] as const) {
      expect(storeStatusNote(status)).toEqual(expect.any(String));
    }
  });
});

describe('revenueWindows', () => {
  it('opens today at Tashkent midnight and the week six days earlier, both closing now', () => {
    const now = tashkent('2026-09-30T15:20:10');
    const { today, week: seven } = revenueWindows(now);
    expect(today).toEqual({
      from: tashkent('2026-09-30T00:00').toISOString(),
      to: now.toISOString(),
    });
    expect(seven).toEqual({
      from: tashkent('2026-09-24T00:00').toISOString(),
      to: now.toISOString(),
    });
  });

  it('is still the Tashkent day in the small hours, when it is yesterday in UTC', () => {
    const now = tashkent('2026-10-01T00:05'); // 19:05 UTC on the 30th
    expect(revenueWindows(now).today.from).toBe('2026-09-30T19:00:00.000Z');
  });

  it('keeps the day until the last minute of it', () => {
    const now = tashkent('2026-09-30T23:59:59');
    expect(revenueWindows(now).today.from).toBe('2026-09-29T19:00:00.000Z');
  });

  it('crosses a month and a year like any other week', () => {
    const { week: seven } = revenueWindows(tashkent('2026-01-03T12:00'));
    expect(seven.from).toBe(tashkent('2025-12-28T00:00').toISOString());
  });
});

describe('asks', () => {
  const NOW = Date.parse('2026-10-01T08:00:00Z');
  const at = (minutes: number) => new Date(NOW + minutes * 60_000).toISOString();
  const ask = (id: string, over: Partial<HaggleDto> = {}): HaggleDto =>
    ({
      id,
      status: 'PENDING',
      expiresAt: at(60),
      updatedAt: at(-30),
      listPrice: { amount: 1_000_000, currency: 'UZS' },
      askedPrice: { amount: 900_000, currency: 'UZS' },
      offeredPrice: null,
      ...over,
    }) as HaggleDto;

  it('lists what still waits, the one about to run out first', () => {
    const rows = [
      ask('late', { expiresAt: at(200) }),
      ask('soon', { expiresAt: at(5) }),
      ask('gone', { expiresAt: at(-1) }),
      ask('done', { status: 'ACCEPTED' }),
    ];
    expect(openAsks(rows, NOW).map((row) => row.id)).toEqual(['soon', 'late']);
  });

  it('lists the latest answers, newest first, at most `limit`', () => {
    const rows = [
      ask('a', { status: 'ACCEPTED', updatedAt: at(-50) }),
      ask('b', { status: 'DECLINED', updatedAt: at(-10) }),
      ask('c', { status: 'EXPIRED', updatedAt: at(-5) }),
      ask('d', { status: 'ACCEPTED', updatedAt: at(-20) }),
      ask('open'),
    ];
    expect(answeredAsks(rows).map((row) => row.id)).toEqual(['b', 'd', 'a']);
    expect(answeredAsks(rows, 2).map((row) => row.id)).toEqual(['b', 'd']);
  });

  it('says how much off is asked, in whole percent', () => {
    expect(askedOffPercent(900_000, 1_000_000)).toBe(10);
    expect(askedOffPercent(666_700, 1_000_000)).toBe(33);
    expect(askedOffPercent(500_000, 1_000_000)).toBe(50);
    expect(askedOffPercent(100, 0)).toBe(0);
  });

  it('says how long an ask lives', () => {
    const expiry = (minutes: number) => at(minutes);
    expect(timeLeftText(expiry(200), NOW)).toBe('осталось 3 ч 20 мин');
    expect(timeLeftText(expiry(180), NOW)).toBe('осталось 3 ч');
    expect(timeLeftText(expiry(45), NOW)).toBe('осталось 45 мин');
    expect(timeLeftText(new Date(NOW + 30_000).toISOString(), NOW)).toBe('осталось меньше минуты');
    expect(timeLeftText(expiry(0), NOW)).toBe('срок вышел');
    expect(timeLeftText(expiry(-5), NOW)).toBe('срок вышел');
  });

  it('takes a counter price between the ask and the list price, in tiyin', () => {
    const row = ask('x');
    expect(parseCounterPrice('9 500', row)).toEqual({ ok: true, value: 950_000 });
    expect(parseCounterPrice('9000', row)).toEqual({ ok: true, value: 900_000 });
    expect(parseCounterPrice('9999,99', row)).toEqual({ ok: true, value: 999_999 });
  });

  it('refuses a counter below the ask (a missing zero), at the list price, or no number', () => {
    const row = ask('x');
    expect(parseCounterPrice('950', row)).toMatchObject({ ok: false });
    expect(parseCounterPrice('8999', row)).toMatchObject({ ok: false });
    expect(parseCounterPrice('10000', row)).toMatchObject({ ok: false });
    expect(parseCounterPrice('12000', row)).toMatchObject({ ok: false });
    for (const bad of ['', '0', 'дёшево']) {
      expect(parseCounterPrice(bad, row)).toMatchObject({ ok: false });
    }
  });
});

describe('stallErrorText', () => {
  it('speaks for the codes the stall meets and leaves the rest to the caller', () => {
    const api = (code: string) => new ApiError(409, { code, message: 'English' });
    expect(stallErrorText(api('NETWORK'), 'x')).toMatch(/связи/);
    expect(stallErrorText(api('FORBIDDEN'), 'x')).toMatch(/не ваш/);
    expect(stallErrorText(api('CONFLICT'), 'x')).toMatch(/изменилось/);
    expect(stallErrorText(api('SOMETHING_NEW'), 'запасной')).toBe('запасной');
    expect(stallErrorText(new Error('boom'), 'запасной')).toBe('запасной');
  });
});
