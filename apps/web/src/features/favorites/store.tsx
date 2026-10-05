/**
 * «Избранное»: the hearts on goods and stalls, shared across the page. The API holds them; this
 * keeps the two id lists so every heart answers at once. A click is applied before the request
 * and taken back if it fails; a guest's click goes to sign-in first and comes back.
 */
'use client';

import { usePathname, useRouter } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { useAuth } from '@/features/auth';
import { api } from '@/lib/api';

export type FavoriteKind = 'product' | 'store';

interface Lists {
  /** Newest first, the way the API answers. */
  product: string[];
  store: string[];
}

interface FavoritesApi extends Lists {
  /** False until the signed-in customer's hearts are in; a guest has none and is ready at once. */
  ready: boolean;
  /** Resolves false when the change did not stick. */
  set: (kind: FavoriteKind, id: string, saved: boolean) => Promise<boolean>;
}

const EMPTY: Lists = { product: [], store: [] };
const FavoritesContext = createContext<FavoritesApi | null>(null);

const without = (list: string[], id: string) => list.filter((x) => x !== id);

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const { user, ready: authReady } = useAuth();
  const [lists, setLists] = useState<Lists>(EMPTY);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!authReady) return;
    if (!user) {
      setLists(EMPTY);
      setReady(true);
      return;
    }
    let alive = true;
    setReady(false);
    api()
      .favorites.list()
      .then((dto) => alive && setLists({ product: dto.productIds, store: dto.storeIds }))
      .catch(() => alive && setLists(EMPTY))
      .finally(() => alive && setReady(true));
    return () => {
      alive = false;
    };
  }, [user, authReady]);

  const set = useCallback(async (kind: FavoriteKind, id: string, saved: boolean) => {
    const apply = (on: boolean) =>
      setLists((current) => ({
        ...current,
        [kind]: on ? [id, ...without(current[kind], id)] : without(current[kind], id),
      }));
    apply(saved);
    const favorites = api().favorites;
    try {
      if (kind === 'product')
        await (saved ? favorites.saveProduct(id) : favorites.forgetProduct(id));
      else await (saved ? favorites.saveStore(id) : favorites.forgetStore(id));
      return true;
    } catch {
      apply(!saved);
      return false;
    }
  }, []);

  const value = useMemo(() => ({ ...lists, ready, set }), [lists, ready, set]);
  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
}

export function useFavorites(): FavoritesApi {
  const context = useContext(FavoritesContext);
  if (!context) throw new Error('useFavorites must be used inside <FavoritesProvider>');
  return context;
}

/** One heart; a guest is sent to sign in and brought back to this page. */
export function useFavorite(kind: FavoriteKind, id: string, locale: string) {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const lists = useFavorites();
  const saved = lists[kind].includes(id);
  const toggle = useCallback(() => {
    if (!user) {
      router.push(`/${locale}/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    void lists.set(kind, id, !saved);
  }, [user, router, locale, pathname, lists, kind, id, saved]);
  return { saved, toggle };
}
