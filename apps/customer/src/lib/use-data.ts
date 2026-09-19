/**
 * Resolve an async loader once per dependency change. `useLoad` is the full
 * shape (data, error, reload for pull-to-refresh); `useData` is the short one
 * most screens use. A reload keeps the old rows on screen until the new ones
 * land; a dependency change clears them (a different store is a different list).
 */
import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react';

export interface Load<T> {
  data: T | null;
  loading: boolean;
  error: boolean;
  reload: () => Promise<void>;
}

export function useLoad<T>(load: () => Promise<T>, deps: DependencyList): Load<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const waiting = useRef<Array<() => void>>([]);
  const first = useRef(true);
  useEffect(() => {
    let alive = true;
    if (first.current) first.current = false;
    else if (tick === 0) setData(null);
    setLoading(true);
    load()
      .then((value) => {
        if (!alive) return;
        setData(value);
        setError(false);
      })
      .catch(() => alive && setError(true))
      .finally(() => {
        if (!alive) return;
        setLoading(false);
        waiting.current.splice(0).forEach((done) => done());
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  const reload = useCallback(
    () =>
      new Promise<void>((resolve) => {
        waiting.current.push(resolve);
        setTick((t) => t + 1);
      }),
    [],
  );
  return { data, loading, error, reload };
}

export function useData<T>(load: () => Promise<T>, deps: DependencyList): T | null {
  return useLoad(load, deps).data;
}

/** One frozen empty list for every `data ?? EMPTY`, so memos keyed on it stay put. */
export const EMPTY: readonly never[] = Object.freeze([]);

/** A list loader that is never null: rows or the shared empty list. */
export function useList<T>(load: () => Promise<T[]>, deps: DependencyList): readonly T[] {
  return useLoad(load, deps).data ?? EMPTY;
}
