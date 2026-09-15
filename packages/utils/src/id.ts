/**
 * id generators.
 */
import { randomBytes, randomUUID } from 'node:crypto';

export const uuid = (): string => randomUUID();

/** Unambiguous alphabet: no 0/O/1/I, so codes survive being read out loud. */
const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export function randomCode(length = 6): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) out += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length];
  return out;
}

/** Numeric OTP. Uses crypto, never Math.random: this guards account access. */
export function randomDigits(length = 6): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) out += String(bytes[i]! % 10);
  return out;
}

/**
 * Human-facing order number, e.g. BZ-240907-4KDQ8P. Short enough to read to a
 * courier over the phone, and not guessable in bulk.
 */
export function orderNumber(now: Date = new Date()): string {
  const yy = String(now.getUTCFullYear()).slice(2);
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  return `BZ-${yy}${mm}${dd}-${randomCode(6)}`;
}

export const randomToken = (bytes = 32): string => randomBytes(bytes).toString('base64url');
