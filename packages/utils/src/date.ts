/**
 * Date/time helpers (Asia/Tashkent).
 */
import { DEFAULT_TIMEZONE } from '@bazar/constants';

export const APP_TIMEZONE = DEFAULT_TIMEZONE;

export const addSeconds = (date: Date, seconds: number): Date =>
  new Date(date.getTime() + seconds * 1000);

export const addMinutes = (date: Date, minutes: number): Date => addSeconds(date, minutes * 60);

export const isExpired = (expiresAt: Date, now: Date = new Date()): boolean =>
  expiresAt.getTime() <= now.getTime();

export const secondsBetween = (from: Date, to: Date): number =>
  Math.round((to.getTime() - from.getTime()) / 1000);

/**
 * Parses "15m" / "30d" / "3600" into seconds. Used for JWT and OTP TTLs, which
 * come from env as human strings.
 */
export function parseDuration(value: string): number {
  const match = /^(\d+)(s|m|h|d)?$/.exec(value.trim());
  if (match === null) throw new RangeError(`Invalid duration: ${value}`);
  const amount = Number(match[1]);
  const unit = match[2] ?? 's';
  const factor = { s: 1, m: 60, h: 3600, d: 86400 }[unit as 's' | 'm' | 'h' | 'd'];
  return amount * factor;
}

/**
 * Local wall-clock parts in Tashkent. Store schedules and daily reports are
 * expressed in local time while the DB stores UTC.
 */
export function tashkentParts(date: Date = new Date()): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
} {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (type: string): number => Number(parts.find((p) => p.type === type)?.value ?? 0);
  // getUTCDay on a date shifted by the zone offset gives the local weekday.
  const local = new Date(date.toLocaleString('en-US', { timeZone: APP_TIMEZONE }));
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    weekday: local.getDay(),
  };
}

/** Minutes since local midnight: how store opening hours are compared. */
export const minutesOfDay = (date: Date = new Date()): number => {
  const { hour, minute } = tashkentParts(date);
  return hour * 60 + minute;
};

/** Start of the local day, as a UTC Date. Used for daily aggregates. */
export function startOfLocalDay(date: Date = new Date()): Date {
  const { year, month, day } = tashkentParts(date);
  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00`;
  // Asia/Tashkent is UTC+5 year-round (no DST), so a fixed offset is correct here.
  return new Date(`${iso}+05:00`);
}

/**
 * The next `weekday` (0 = Sunday) at `hour`:00 Tashkent time, strictly after
 * `from`. ponytail: Tashkent is UTC+5 with no DST, so the offset is a constant.
 */
export function nextLocalOccurrence(weekday: number, hour: number, from: Date = new Date()): Date {
  const local = tashkentParts(from);
  let days = (weekday - local.weekday + 7) % 7;
  if (days === 0 && local.hour * 60 + local.minute >= hour * 60) days = 7;
  return new Date(Date.UTC(local.year, local.month - 1, local.day + days, hour - 5, 0, 0));
}
