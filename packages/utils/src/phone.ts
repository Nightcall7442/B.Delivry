/**
 * normalizeUzPhone(+998...), maskPhone.
 */
import { COUNTRY_PHONE_PREFIX, DEFAULT_COUNTRY, UZ_PHONE_REGEX } from '@bazar/constants';

const UZ_PREFIX = COUNTRY_PHONE_PREFIX[DEFAULT_COUNTRY];

/**
 * Accepts anything a human types (901234567, 998 90 123-45-67, +998(90)1234567)
 * and returns the canonical +998XXXXXXXXX. Returns null when it is not a UZ number.
 *
 * Every phone entering the system goes through here: DB, OTP and login all
 * compare canonical strings, so normalizing at one place is what makes them match.
 */
export function normalizeUzPhone(input: string): string | null {
  const digits = input.replace(/\D/g, '');
  // 901234567 -> national number without the country code
  const national = digits.length === 9 ? digits : digits.startsWith('998') ? digits.slice(3) : null;
  if (national === null || national.length !== 9) return null;
  const normalized = `${UZ_PREFIX}${national}`;
  return UZ_PHONE_REGEX.test(normalized) ? normalized : null;
}

export const isUzPhone = (input: string): boolean => normalizeUzPhone(input) !== null;

/** +998901234567 -> +998 90 *** ** 67. Used in logs, receipts and support UIs. */
export function maskPhone(phone: string): string {
  const normalized = normalizeUzPhone(phone);
  if (normalized === null) return '***';
  const national = normalized.slice(4);
  return `${UZ_PREFIX} ${national.slice(0, 2)} *** ** ${national.slice(7)}`;
}

/** +998901234567 -> +998 90 123 45 67, for display only. */
export function formatUzPhone(phone: string): string {
  const normalized = normalizeUzPhone(phone);
  if (normalized === null) return phone;
  const n = normalized.slice(4);
  return `${UZ_PREFIX} ${n.slice(0, 2)} ${n.slice(2, 5)} ${n.slice(5, 7)} ${n.slice(7)}`;
}
