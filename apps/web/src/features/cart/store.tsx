/**
 * Cart state: quantities keyed by product id, shared across the whole tree.
 *
 * It lives in one context because two places have to agree — the counter in the
 * header and the stepper on the card. Persistence is localStorage, and the
 * write only starts after hydration so an empty first render cannot wipe a
 * basket that was already there.
 *
 * ponytail: browser-local, one device. Swap the read/write pair for the cart
 * endpoints once `@bazar/api-client` exists; the hooks below stay as they are.
 */
'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';

import type { CartQuantities } from '@bazar/storefront';

const KEY = 'bazar.cart';

interface CartApi {
  quantities: CartQuantities;
  /** False until localStorage has been read — the first render is always empty. */
  ready: boolean;
  setQuantity: (productId: string, quantity: number) => void;
  /** Whole-cart write: "repeat order", a recipe set. */
  replace: (next: CartQuantities) => void;
  clear: (productIds?: readonly string[]) => void;
}

const CartContext = createContext<CartApi | null>(null);

function read(): CartQuantities {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    // Anything non-numeric in storage is someone else's data or a bad write.
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(
        (entry): entry is [string, number] => typeof entry[1] === 'number' && entry[1] > 0,
      ),
    );
  } catch {
    // Private mode, disabled storage, corrupt JSON — an empty cart is fine.
    return {};
  }
}

export type { CartLine, CartQuantities, CartStoreGroup } from '@bazar/storefront';
export { groupByStore } from '@bazar/storefront';

export function CartProvider({ children }: { children: ReactNode }) {
  const [quantities, setQuantities] = useState<CartQuantities>({});
  const [ready, setReady] = useState(false);
  const hydrated = useRef(false);

  useEffect(() => {
    setQuantities(read());
    hydrated.current = true;
    setReady(true);
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    try {
      window.localStorage.setItem(KEY, JSON.stringify(quantities));
    } catch {
      // The quantities still live in state for this session.
    }
  }, [quantities]);

  const setQuantity = useCallback((productId: string, quantity: number) => {
    // Weighted goods step by 0.5, so round the float dust away.
    const next = Number(Math.max(0, quantity).toFixed(3));
    setQuantities((current) => {
      if ((current[productId] ?? 0) === next) return current;
      const draft = { ...current };
      if (next <= 0) delete draft[productId];
      else draft[productId] = next;
      return draft;
    });
  }, []);

  const replace = useCallback((next: CartQuantities) => {
    setQuantities(Object.fromEntries(Object.entries(next).filter(([, q]) => q > 0)));
  }, []);

  const clear = useCallback((productIds?: readonly string[]) => {
    setQuantities((current) => {
      if (!productIds) return {};
      const draft = { ...current };
      for (const id of productIds) delete draft[id];
      return draft;
    });
  }, []);

  const value = useMemo(
    () => ({ quantities, ready, setQuantity, replace, clear }),
    [quantities, ready, setQuantity, replace, clear],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

function useCart(): CartApi {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart must be used inside <CartProvider>');
  return context;
}

/** Everything the cart screen needs. */
export function useCartQuantities(): CartQuantities {
  return useCart().quantities;
}

/** Whether the quantities above are real yet, or the empty pre-hydration state. */
export function useCartReady(): boolean {
  return useCart().ready;
}

export function useCartActions(): Pick<CartApi, 'setQuantity' | 'replace' | 'clear'> {
  const { setQuantity, replace, clear } = useCart();
  return { setQuantity, replace, clear };
}

/** Distinct products, not units — "3 позиции", the way a basket badge counts. */
export function useCartCount(): number {
  return Object.keys(useCart().quantities).length;
}

/** The stepper on a product card. */
export function useCartItem(productId: string, step = 1, min = 1) {
  const { quantities, setQuantity } = useCart();
  const quantity = quantities[productId] ?? 0;

  return {
    quantity,
    add: () => setQuantity(productId, quantity === 0 ? min : quantity + step),
    remove: () => setQuantity(productId, quantity - step < min ? 0 : quantity - step),
  };
}
