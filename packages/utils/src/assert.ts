/**
 * invariant / assertNever.
 */

export class InvariantError extends Error {
  override readonly name = 'InvariantError';
}

/** Narrows a value and throws when the assumption is broken. */
export function invariant(condition: unknown, message = 'Invariant violated'): asserts condition {
  if (!condition) throw new InvariantError(message);
}

/**
 * Exhaustiveness check. Put it in the default branch of a switch over a union:
 * adding a new order status then breaks the build instead of silently falling through.
 */
export function assertNever(value: never, message = 'Unexpected value'): never {
  throw new InvariantError(`${message}: ${JSON.stringify(value)}`);
}

export function assertDefined<T>(value: T | null | undefined, message = 'Expected a value'): T {
  invariant(value !== null && value !== undefined, message);
  return value;
}
