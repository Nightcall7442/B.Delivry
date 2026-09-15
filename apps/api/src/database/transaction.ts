/**
 * runInTransaction(fn) — unit-of-work wrapper around prisma.$transaction.
 */
import type { PrismaClient } from '@prisma/client';
import type { PrismaTransaction } from '../common/base/base.repository.js';

export interface TransactionOptions {
  /** Milliseconds the interactive transaction may hold its connection. */
  timeout?: number;
  maxWait?: number;
  isolationLevel?: 'ReadCommitted' | 'RepeatableRead' | 'Serializable';
}

/**
 * A transaction holds a pool connection for its whole body, so nothing slow
 * belongs inside one: no provider calls, no notifications, no map lookups.
 * Write the rows, commit, then publish events.
 */
export function runInTransaction<T>(
  prisma: PrismaClient,
  fn: (tx: PrismaTransaction) => Promise<T>,
  options: TransactionOptions = {},
): Promise<T> {
  return prisma.$transaction(fn, {
    timeout: options.timeout ?? 10_000,
    maxWait: options.maxWait ?? 5_000,
    ...(options.isolationLevel !== undefined ? { isolationLevel: options.isolationLevel } : {}),
  });
}

/**
 * Serializable for the money paths: courier balance and coupon redemption both
 * read a value and write a derived one, which is exactly where ReadCommitted
 * lets two concurrent requests both win.
 */
export function runSerializable<T>(
  prisma: PrismaClient,
  fn: (tx: PrismaTransaction) => Promise<T>,
): Promise<T> {
  return runInTransaction(prisma, fn, { isolationLevel: 'Serializable' });
}

/** Postgres serialization failure: safe to retry the whole transaction. */
const isSerializationError = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  (error as { code?: string }).code === 'P2034';

export async function runSerializableWithRetry<T>(
  prisma: PrismaClient,
  fn: (tx: PrismaTransaction) => Promise<T>,
  attempts = 3,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await runSerializable(prisma, fn);
    } catch (error) {
      if (!isSerializationError(error)) throw error;
      lastError = error;
      // Small jittered backoff: retrying instantly just collides again.
      await new Promise((resolve) => setTimeout(resolve, attempt * 25 + Math.random() * 25));
    }
  }
  throw lastError;
}
