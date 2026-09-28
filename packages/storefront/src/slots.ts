/**
 * Delivery windows. The morning slot is the product: goods bought at the
 * bazaar as it opens, at the door before breakfast. Three windows a day, no
 * arbitrary times — a stall cannot promise 13:47.
 *
 * Every hour here is Tashkent's (UTC+5 all year), whatever zone the phone is
 * in, and a window is offered only when every store of the trip is open at
 * its start — the API refuses anything else (`StoresService.isOpen`).
 */
import { createT } from '@bazar/i18n';
import type { StoreDto, StoreScheduleDto } from '@bazar/types';

export interface DeliverySlot {
  /** `${day}-${startHour}`, stable across renders. */
  id: string;
  /** ISO start of the window. */
  startsAt: string;
  day: 'today' | 'tomorrow';
  label: string;
}

const WINDOWS: readonly [number, number][] = [
  [8, 10],
  [12, 14],
  [18, 20],
];

/** A slot needs this much notice: the courier has to reach the bazaar first. */
const NOTICE_MINUTES = 90;

const TASHKENT_MS = 5 * 3_600_000;

const two = (n: number) => String(n).padStart(2, '0');

/** Wall-clock Tashkent: the calendar day, the weekday (0 = Sunday), the hour and minute of the day. */
function tashkent(at: Date) {
  const t = new Date(at.getTime() + TASHKENT_MS);
  return {
    year: t.getUTCFullYear(),
    month: t.getUTCMonth(),
    date: t.getUTCDate(),
    weekday: t.getUTCDay(),
    hour: t.getUTCHours(),
    minute: t.getUTCHours() * 60 + t.getUTCMinutes(),
  };
}

/** `hour`:00 in Tashkent, `days` Tashkent days after `now`. */
function tashkentHourOn(now: Date, days: number, hour: number): Date {
  const day = tashkent(now);
  return new Date(Date.UTC(day.year, day.month, day.date + days, hour) - TASHKENT_MS);
}

type Scheduled = {
  schedule: readonly Pick<StoreScheduleDto, 'weekday' | 'opensAt' | 'closesAt' | 'closed'>[];
} & Partial<Pick<StoreDto, 'status'>>;

/** The API's rule to the minute: an active store, its row for the Tashkent weekday, opens ≤ t < closes. */
export function isOpenAt(store: Scheduled, at: Date = new Date()): boolean {
  if (store.status !== undefined && store.status !== 'ACTIVE') return false;
  const { weekday, minute } = tashkent(at);
  const today = store.schedule.find((row) => row.weekday === weekday);
  if (today === undefined || today.closed) return false;
  return minute >= today.opensAt && minute < today.closesAt;
}

/** The windows still ahead with enough notice, today and tomorrow, that every store of the trip can serve. */
export function deliverySlots(
  now: Date = new Date(),
  locale = 'ru',
  stores: readonly Scheduled[] = [],
): DeliverySlot[] {
  const t = createT(locale);
  const slots: DeliverySlot[] = [];
  for (const [offset, day] of [
    [0, 'today'],
    [1, 'tomorrow'],
  ] as const) {
    for (const [from, to] of WINDOWS) {
      const startsAt = tashkentHourOn(now, offset, from);
      if (startsAt.getTime() - now.getTime() < NOTICE_MINUTES * 60_000) continue;
      if (!stores.every((store) => isOpenAt(store, startsAt))) continue;
      slots.push({
        id: `${day}-${from}`,
        startsAt: startsAt.toISOString(),
        day,
        label: `${t(day === 'today' ? 'slots.today' : 'slots.tomorrow')} ${two(from)}:00–${two(to)}:00`,
      });
    }
  }
  return slots;
}

/** The label for an order's `scheduledFor`, matching the chip the customer tapped. */
export function slotLabel(scheduledFor: string, locale = 'ru', now: Date = new Date()): string {
  const t = createT(locale);
  const at = tashkent(new Date(scheduledFor));
  const window = WINDOWS.find(([from]) => from === at.hour);
  const time = window
    ? `${two(window[0])}:00–${two(window[1])}:00`
    : `${two(at.hour)}:${two(at.minute % 60)}`;
  const today = tashkent(now);
  const tomorrow = tashkent(tashkentHourOn(now, 1, 12));
  const same = (a: typeof at, b: typeof at) =>
    a.year === b.year && a.month === b.month && a.date === b.date;
  const day = same(at, today)
    ? t('slots.today')
    : same(at, tomorrow)
      ? t('slots.tomorrow')
      : t.date(new Date(scheduledFor));
  return `${day} ${time}`;
}
