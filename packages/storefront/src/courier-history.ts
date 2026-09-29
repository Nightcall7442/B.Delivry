/**
 * The courier's ledger: which of their trips are over, which day each one
 * belongs to and what they paid. Days are Tashkent's (UTC+5 all year), whatever
 * zone the phone is in — the courier's «сегодня» is the bazaar's.
 *
 * Only a delivered trip earns. A failed or cancelled one stays in the history
 * with its reason, but never in a sum.
 */
import { DELIVERY_STATUS } from '@bazar/constants';
import { createT } from '@bazar/i18n';
import type { DeliveryDto } from '@bazar/types';

import { tr } from './i18n.js';

/** What the ledger reads off a trip; every `DeliveryDto` has all of it. */
export type LedgerTrip = Pick<
  DeliveryDto,
  'id' | 'status' | 'payout' | 'deliveredAt' | 'updatedAt'
>;

const TASHKENT_MS = 5 * 3_600_000;
const DAY_MS = 86_400_000;

const two = (n: number) => String(n).padStart(2, '0');

/** The trip is over: handed over, or ended without a hand-over. */
export const isFinished = (trip: Pick<LedgerTrip, 'status'>): boolean =>
  trip.status === DELIVERY_STATUS.DELIVERED ||
  trip.status === DELIVERY_STATUS.FAILED ||
  trip.status === DELIVERY_STATUS.CANCELLED;

/** When it ended, in ms: the hand-over stamp, else the last time the row moved (a failed trip has no other). */
export const finishedAt = (trip: Pick<LedgerTrip, 'deliveredAt' | 'updatedAt'>): number =>
  Date.parse(trip.deliveredAt ?? trip.updatedAt);

/**
 * The finished trips, newest first. Pages fetched one after another overlap when a trip is created
 * between two requests, so a repeated id counts once.
 */
export function finishedTrips<T extends LedgerTrip>(trips: readonly T[]): T[] {
  const seen = new Set<string>();
  const finished: T[] = [];
  for (const trip of trips) {
    if (!isFinished(trip) || seen.has(trip.id)) continue;
    seen.add(trip.id);
    finished.push(trip);
  }
  return finished.sort((a, b) => finishedAt(b) - finishedAt(a));
}

/** The trips that paid, only those that ended at or after `sinceMs` when it is given. */
export const paidTrips = <T extends LedgerTrip>(trips: readonly T[], sinceMs = -Infinity): T[] =>
  trips.filter((trip) => trip.status === DELIVERY_STATUS.DELIVERED && finishedAt(trip) >= sinceMs);

/** What the trips paid, in minor units. */
export const sumPayout = (trips: readonly LedgerTrip[], sinceMs?: number): number =>
  paidTrips(trips, sinceMs).reduce((sum, trip) => sum + trip.payout.amount, 0);

/** Whole Tashkent days since the epoch: the day an instant falls in. */
const dayIndex = (ms: number): number => Math.floor((ms + TASHKENT_MS) / DAY_MS);

/** Midnight of the Tashkent day `daysBack` days before the one `now` is in, as an instant in ms. */
export const dayStart = (now: Date, daysBack = 0): number =>
  (dayIndex(now.getTime()) - daysBack) * DAY_MS - TASHKENT_MS;

/** «HH:mm» on Tashkent's clock. */
export function tripTime(trip: Pick<LedgerTrip, 'deliveredAt' | 'updatedAt'>): string {
  const local = new Date(finishedAt(trip) + TASHKENT_MS);
  return `${two(local.getUTCHours())}:${two(local.getUTCMinutes())}`;
}

/** «Сегодня», «Вчера», then the date — with the year once it is not this one. */
function dayLabel(index: number, today: number): string {
  if (index === today) return 'Сегодня';
  if (index === today - 1) return 'Вчера';
  // Noon UTC of that date is the same date on any phone from UTC−11 to UTC+11 (`t.date` reads the device's).
  const date = createT('ru').date(new Date(index * DAY_MS + DAY_MS / 2));
  const year = new Date(index * DAY_MS).getUTCFullYear();
  return year === new Date(today * DAY_MS).getUTCFullYear() ? date : `${date} ${year}`;
}

export interface TripDay<T extends LedgerTrip = LedgerTrip> {
  /** The Tashkent date, `YYYY-MM-DD`: a stable list key. */
  key: string;
  label: string;
  /** Newest first. */
  trips: T[];
  /** What the day's delivered trips paid, in minor units. */
  total: number;
}

/** The finished trips as days, newest day first. A day of failed trips only is still a day, worth 0. */
export function groupTripsByDay<T extends LedgerTrip>(
  trips: readonly T[],
  now: Date = new Date(),
): TripDay<T>[] {
  const today = dayIndex(now.getTime());
  const days: TripDay<T>[] = [];
  let day: TripDay<T> | undefined;
  let current = NaN;
  for (const trip of finishedTrips(trips)) {
    const index = dayIndex(finishedAt(trip));
    if (day === undefined || index !== current) {
      current = index;
      day = {
        key: new Date(index * DAY_MS).toISOString().slice(0, 10),
        label: dayLabel(index, today),
        trips: [],
        total: 0,
      };
      days.push(day);
    }
    day.trips.push(trip);
  }
  for (const each of days) each.total = sumPayout(each.trips);
  return days;
}

/**
 * The stall's name with the order number under it. Either can be missing (a row read without its
 * order), and a row still needs a title: the number stands in, then a bare «Заказ».
 */
export function tripTitle(trip: Pick<DeliveryDto, 'storeName' | 'orderNumber'>): {
  title: string;
  number: string | null;
} {
  const name = tr(trip.storeName, 'ru');
  // The short form the customer reads on their receipt: BZ-240907-4KDQ8P → № 4KDQ8P.
  const number = trip.orderNumber ? `№ ${trip.orderNumber.replace(/^BZ-\d+-/, '')}` : null;
  if (name) return { title: name, number };
  return { title: number ? `Заказ ${number}` : 'Заказ', number: null };
}
