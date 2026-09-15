/**
 * Auth guards: password hashing and constant-time comparison.
 */
import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import { promisify } from 'node:util';

/**
 * promisify picks scrypt's three-argument overload, losing the options
 * parameter that carries the cost factors. Re-typed here so N/r/p can be set.
 */
const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
) => Promise<Buffer>;

/**
 * scrypt from node:crypto rather than bcrypt or argon2. It is memory-hard,
 * ships with the runtime and needs no native build step in the Docker image.
 *
 * Format: scrypt$N$r$p$salt$hash, so the cost parameters travel with the hash
 * and can be raised later without invalidating existing passwords.
 */
const N = 2 ** 15;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derived = await scryptAsync(password, salt, KEY_LENGTH, {
    N,
    r: R,
    p: P,
    // scrypt needs roughly 128 * N * r bytes; the default cap is below that.
    maxmem: 256 * N * R,
  });

  return ['scrypt', N, R, P, salt.toString('base64'), derived.toString('base64')].join('$');
}

/**
 * Always runs the full derivation before comparing, and compares in constant
 * time: an early return on a malformed hash would leak which accounts exist.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const [, n, r, p, saltB64, hashB64] = parts;
  const cost = Number(n);
  const blockSize = Number(r);
  const parallel = Number(p);
  if (!Number.isInteger(cost) || !Number.isInteger(blockSize) || !Number.isInteger(parallel)) {
    return false;
  }

  const salt = Buffer.from(saltB64 ?? '', 'base64');
  const expected = Buffer.from(hashB64 ?? '', 'base64');
  if (salt.length === 0 || expected.length === 0) return false;

  const derived = await scryptAsync(password, salt, expected.length, {
    N: cost,
    r: blockSize,
    p: parallel,
    maxmem: 256 * cost * blockSize,
  });

  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

/**
 * OTP codes are short-lived but they are still credentials, so they are stored
 * hashed. SHA-256 is enough here: a 6-digit code has no entropy to protect
 * against an offline attack anyway, and the real defence is the attempt limit.
 */
export async function hashOtp(code: string, salt: string): Promise<string> {
  const { createHmac } = await import('node:crypto');
  return createHmac('sha256', salt).update(code).digest('base64');
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
