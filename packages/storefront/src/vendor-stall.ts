/**
 * What the stall's own page rests on: its hours as the seller writes them and as the API keeps
 * them, the days revenue is counted over, and the asks of customers who want a lower price.
 * Every clock and every day here is Tashkent's (UTC+5 all year), whatever zone the phone is in.
 */
import { isApiError } from '@bazar/api-client';
import type { StoreStatus } from '@bazar/constants';
import type { HaggleDto, StoreScheduleDto } from '@bazar/types';

import { dayStart } from './courier-history.js';
import { HOURS } from './shops.js';
import { parsePriceInput, type InputResult } from './vendor-goods.js';

const TASHKENT_MS = 5 * 3_600_000;
const DAY_MINUTES = 24 * 60;

const two = (n: number) => String(n).padStart(2, '0');

/** One weekday of the week as the API stores it; 0 = Sunday, like `Date.getDay()`. */
export type ScheduleRow = Pick<StoreScheduleDto, 'weekday' | 'opensAt' | 'closesAt' | 'closed'>;

// ---- hours --------------------------------------------------------------------------------------

/** The seller's week, Monday first. */
export const STALL_WEEK: ReadonlyArray<{ weekday: number; label: string }> = [
  { weekday: 1, label: 'Пн' },
  { weekday: 2, label: 'Вт' },
  { weekday: 3, label: 'Ср' },
  { weekday: 4, label: 'Чт' },
  { weekday: 5, label: 'Пт' },
  { weekday: 6, label: 'Сб' },
  { weekday: 0, label: 'Вс' },
];

/** Minutes since midnight → «07:05»; a stall that trades until midnight closes at «24:00». */
export const clockText = (minutes: number): string =>
  `${two(Math.floor(minutes / 60))}:${two(minutes % 60)}`;

/** The field as it is typed: digits only, the colon put in after the hour (0730 → «07:30»). */
export function clockMask(text: string): string {
  const digits = text.replace(/\D/g, '').slice(0, 4);
  return digits.length > 2 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits;
}

/** «7:30», «07:30», «0730» and a bare «7» → minutes since midnight; null for anything that is no time. */
export function parseClock(text: string): number | null {
  const match = /^(\d{1,2})(?::?(\d{2}))?$/.exec(text.trim());
  if (match === null) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2] ?? 0);
  if (minutes > 59) return null;
  const total = hours * 60 + minutes;
  return total > DAY_MINUTES ? null : total;
}

const tashkentWeekday = (now: Date): number => new Date(now.getTime() + TASHKENT_MS).getUTCDay();

/** «Сегодня 06:30 – 18:00», «Сегодня выходной» — a weekday with no row is a day off, as in the API. */
export function todayHoursText(schedule: readonly ScheduleRow[], now: Date = new Date()): string {
  if (schedule.length === 0) return 'Часы не заданы';
  const today = schedule.find((row) => row.weekday === tashkentWeekday(now));
  if (today === undefined || today.closed) return 'Сегодня выходной';
  return `Сегодня ${clockText(today.opensAt)} – ${clockText(today.closesAt)}`;
}

/** The hours form: one time for the working days, as the admin cabinet writes it. */
export interface HoursDraft {
  opens: string;
  closes: string;
  /** Indexed by weekday (0 = Sunday): does the stall trade that day. */
  days: boolean[];
}

const isWorking = (row: ScheduleRow | undefined): row is ScheduleRow =>
  row !== undefined && !row.closed;

/**
 * What the form opens with: the hours of the first working day (Monday first), the working days as
 * they are. A stall that never set hours starts from the rows' usual hours, every day.
 */
export function hoursDraft(schedule: readonly ScheduleRow[]): HoursDraft {
  if (schedule.length === 0) {
    return {
      opens: clockText(HOURS.stall.opensAt),
      closes: clockText(HOURS.stall.closesAt),
      days: Array.from({ length: 7 }, () => true),
    };
  }
  const first = STALL_WEEK.map(({ weekday }) =>
    schedule.find((row) => row.weekday === weekday),
  ).find(isWorking);
  return {
    opens: clockText(first?.opensAt ?? HOURS.stall.opensAt),
    closes: clockText(first?.closesAt ?? HOURS.stall.closesAt),
    days: Array.from({ length: 7 }, (_, weekday) =>
      isWorking(schedule.find((row) => row.weekday === weekday)),
    ),
  };
}

/** The API keeps one time per weekday; the form writes one time for all. True when saving would level them. */
export function hoursUneven(schedule: readonly ScheduleRow[]): boolean {
  const working = schedule.filter(isWorking);
  const [head] = working;
  return (
    head !== undefined &&
    working.some((row) => row.opensAt !== head.opensAt || row.closesAt !== head.closesAt)
  );
}

/** Seven rows replace the week; a day off keeps the times, the API only reads them on working days. */
export function buildSchedule(
  opensAt: number,
  closesAt: number,
  days: readonly boolean[],
): ScheduleRow[] {
  return Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    opensAt,
    closesAt,
    closed: days[weekday] !== true,
  }));
}

export type HoursResult = { ok: true; schedule: ScheduleRow[] } | { ok: false; error: string };

export function validateHours(draft: HoursDraft): HoursResult {
  const opensAt = parseClock(draft.opens);
  const closesAt = parseClock(draft.closes);
  if (opensAt === null || closesAt === null) {
    return { ok: false, error: 'Время — часы и минуты, например 07:30' };
  }
  if (opensAt >= closesAt) {
    return { ok: false, error: 'Закрываетесь раньше, чем открываетесь' };
  }
  if (!draft.days.some(Boolean)) {
    return { ok: false, error: 'Отметьте хотя бы один рабочий день' };
  }
  return { ok: true, schedule: buildSchedule(opensAt, closesAt, draft.days) };
}

/** «Каждый день», «Пн–Сб», «Пн, Ср, Пт»: the working days in the seller's week. */
export function daysText(days: readonly boolean[]): string {
  const week = STALL_WEEK.map((day) => ({ ...day, on: days[day.weekday] === true }));
  const on = week.filter((day) => day.on);
  if (on.length === 0) return 'Выходной всю неделю';
  if (on.length === 7) return 'Каждый день';
  const first = week.findIndex((day) => day.on);
  const run = week.slice(first, first + on.length);
  // One unbroken stretch reads as a range: «Пн–Сб».
  if (on.length > 2 && run.every((day) => day.on)) {
    return `${on[0]!.label}–${on[on.length - 1]!.label}`;
  }
  return on.map((day) => day.label).join(', ');
}

/** The morning photograph is today's or it is stale: a counter shot yesterday says nothing about now. */
export const counterPhotoFresh = (takenAt: string | null, now: Date = new Date()): boolean =>
  takenAt !== null && Date.parse(takenAt) >= dayStart(now);

/** Why a stall that is not open may not be for the hours' sake; null when it is live. */
export function storeStatusNote(status: StoreStatus): string | null {
  switch (status) {
    case 'ACTIVE':
      return null;
    case 'DRAFT':
      return 'Прилавок ещё не опубликован — покупатели его не видят';
    case 'PENDING_REVIEW':
      return 'Прилавок на проверке — покупатели увидят его после неё';
    case 'SUSPENDED':
      return 'Прилавок приостановлен — напишите в поддержку';
    case 'CLOSED':
      return 'Прилавок закрыт';
  }
}

// ---- revenue ------------------------------------------------------------------------------------

export interface RevenueWindow {
  /** ISO instants: the API wants a timezone on every date. */
  from: string;
  to: string;
}

/**
 * «Сегодня» and «7 дней» as the bazaar counts them: from Tashkent midnight — today's, and the one
 * six days earlier — up to this moment. The API measures an order by when it was placed.
 */
export function revenueWindows(now: Date = new Date()): {
  today: RevenueWindow;
  week: RevenueWindow;
} {
  const to = now.toISOString();
  return {
    today: { from: new Date(dayStart(now, 0)).toISOString(), to },
    week: { from: new Date(dayStart(now, 6)).toISOString(), to },
  };
}

// ---- haggling -----------------------------------------------------------------------------------

const asMs = (iso: string) => Date.parse(iso);

/** Asks still waiting for an answer, the one that runs out first on top. */
export function openAsks(rows: readonly HaggleDto[], now: number = Date.now()): HaggleDto[] {
  return rows
    .filter((row) => row.status === 'PENDING' && asMs(row.expiresAt) > now)
    .sort((a, b) => asMs(a.expiresAt) - asMs(b.expiresAt));
}

/** The latest answers, newest first: what was agreed and what was turned down. */
export function answeredAsks(rows: readonly HaggleDto[], limit = 5): HaggleDto[] {
  return rows
    .filter((row) => row.status === 'ACCEPTED' || row.status === 'DECLINED')
    .sort((a, b) => asMs(b.updatedAt) - asMs(a.updatedAt))
    .slice(0, limit);
}

/** How much of the list price the customer asks off, in whole percent. */
export const askedOffPercent = (askedMinor: number, listMinor: number): number =>
  listMinor > 0 ? Math.round((1 - askedMinor / listMinor) * 100) : 0;

/** «осталось 3 ч 20 мин»: an ask lives a few hours, so nothing bigger than hours is needed. */
export function timeLeftText(expiresAt: string, now: number = Date.now()): string {
  if (asMs(expiresAt) <= now) return 'срок вышел';
  const minutes = Math.floor((asMs(expiresAt) - now) / 60_000);
  if (minutes < 1) return 'осталось меньше минуты';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `осталось ${rest} мин`;
  return rest === 0 ? `осталось ${hours} ч` : `осталось ${hours} ч ${rest} мин`;
}

/**
 * The seller's own number for an ask, in soum as typed → minor units. Between what the customer
 * offers and the price on the counter: lower is a bigger discount than anyone asked for (a typo
 * with a missing zero), and the list price itself is no discount — the seller declines instead.
 */
export function parseCounterPrice(
  text: string,
  ask: Pick<HaggleDto, 'askedPrice' | 'listPrice'>,
): InputResult<number> {
  const price = parsePriceInput(text, ask.listPrice.currency);
  if (!price.ok) return price;
  if (price.value < ask.askedPrice.amount) {
    return { ok: false, error: 'Ниже, чем просит покупатель: для такой цены нажмите «Согласен»' };
  }
  if (price.value >= ask.listPrice.amount) {
    return { ok: false, error: 'Цена должна быть ниже, чем на витрине, — или откажите' };
  }
  return price;
}

// ---- errors -------------------------------------------------------------------------------------

const STALL_ERROR: Record<string, string> = {
  NETWORK: 'Нет связи. Проверьте интернет и попробуйте ещё раз',
  FORBIDDEN: 'Это не ваш прилавок',
  NOT_FOUND: 'Этого уже нет — обновите экран',
  CONFLICT: 'Тут что-то уже изменилось — обновите экран и попробуйте снова',
  VALIDATION: 'Проверьте введённые значения',
  PAYLOAD_TOO_LARGE: 'Файл слишком большой',
};

/** What the API refused, in the stall's words; `fallback` for what it has no words for. */
export function stallErrorText(error: unknown, fallback: string): string {
  return (isApiError(error) ? STALL_ERROR[error.code] : undefined) ?? fallback;
}
