/**
 * Cart state: quantities keyed by product id, shared across the tree, persisted
 * on the device. Same hooks as the web app.
 */
import type { CartQuantities } from '@bazar/storefront';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { readJson, writeJson } from '@bazar/mobile';

import { tap } from '@/lib/haptics';

export type { CartLine, CartQuantities, CartStoreGroup } from '@bazar/storefront';
export { groupByStore } from '@bazar/storefront';

const KEY = 'bazar.cart';

interface CartApi {
  quantities: CartQuantities;
  /** False until the stored cart is read: merges before that would overwrite it. */
  ready: boolean;
  setQuantity: (productId: string, quantity: number) => void;
  /** Whole-cart write: "repeat order", a recipe set. */
  replace: (next: CartQuantities) => void;
  clear: (productIds?: readonly string[]) => void;
}

const CartContext = createContext<CartApi | null>(null);

const isQuantities = (v: unknown): v is CartQuantities =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export function CartProvider({ children }: { children: ReactNode }) {
  const [quantities, setQuantities] = useState<CartQuantities>({});
  const [ready, setReady] = useState(false);
  const hydrated = useRef(false);

  useEffect(() => {
    readJson(KEY, isQuantities).then((stored) => {
      if (stored) {
        setQuantities(
          Object.fromEntries(
            Object.entries(stored).filter(([, q]) => typeof q === 'number' && q > 0),
          ),
        );
      }
      hydrated.current = true;
      setReady(true);
    });
  }, []);

  useEffect(() => {
    if (hydrated.current) writeJson(KEY, quantities);
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

export function useCart(): CartApi {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart must be used inside <CartProvider>');
  return context;
}

export const useCartQuantities = (): CartQuantities => useCart().quantities;
export const useCartReady = (): boolean => useCart().ready;

export function useCartActions(): Pick<CartApi, 'setQuantity' | 'replace' | 'clear'> {
  const { setQuantity, replace, clear } = useCart();
  return { setQuantity, replace, clear };
}

/** Distinct products, not units — "3 позиции", the way a basket badge counts. */
export const useCartCount = (): number => Object.keys(useCart().quantities).length;

/** The stepper on a product tile. */
export function useCartItem(productId: string, step = 1, min = 1) {
  const { quantities, setQuantity } = useCart();
  const quantity = quantities[productId] ?? 0;
  return {
    quantity,
    add: () => {
      tap();
      setQuantity(productId, quantity === 0 ? min : quantity + step);
    },
    remove: () => {
      tap();
      setQuantity(productId, quantity - step < min ? 0 : quantity - step);
    },
  };
}
