/**
 * chunk, groupBy, uniqBy.
 */

export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (size < 1) throw new RangeError('chunk size must be >= 1');
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export function groupBy<T, K extends PropertyKey>(
  items: readonly T[],
  key: (item: T) => K,
): Record<K, T[]> {
  const out = {} as Record<K, T[]>;
  for (const item of items) {
    const k = key(item);
    (out[k] ??= []).push(item);
  }
  return out;
}

export function uniqBy<T, K>(items: readonly T[], key: (item: T) => K): T[] {
  const seen = new Set<K>();
  return items.filter((item) => {
    const k = key(item);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Index a list by id for O(1) lookups when joining data from two queries. */
export function keyBy<T, K extends PropertyKey>(
  items: readonly T[],
  key: (item: T) => K,
): Record<K, T> {
  const out = {} as Record<K, T>;
  for (const item of items) out[key(item)] = item;
  return out;
}

export const sum = (items: readonly number[]): number => items.reduce((a, b) => a + b, 0);

export const sumBy = <T>(items: readonly T[], value: (item: T) => number): number =>
  items.reduce((acc, item) => acc + value(item), 0);
