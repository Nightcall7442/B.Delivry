/**
 * Where the order goes. One address at a time, remembered in localStorage.
 *
 * ponytail: single address, no saved list. Swap for `api.addresses` when the
 * customer has an account; the hook shape stays.
 */
'use client';

import type { DeliveryAddress } from '@bazar/storefront';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

const KEY = 'bazar.address';

interface AddressApi {
  address: DeliveryAddress | null;
  /** False until localStorage has been read. */
  ready: boolean;
  setAddress: (address: DeliveryAddress | null) => void;
}

const AddressContext = createContext<AddressApi | null>(null);

function read(): DeliveryAddress | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DeliveryAddress>;
    if (typeof parsed.text !== 'string' || typeof parsed.point?.lat !== 'number') return null;
    return parsed as DeliveryAddress;
  } catch {
    return null;
  }
}

export type { DeliveryAddress };
export { DEFAULT_POINT } from '@bazar/storefront';

export function AddressProvider({ children }: { children: ReactNode }) {
  const [address, setState] = useState<DeliveryAddress | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setState(read());
    setReady(true);
  }, []);

  const setAddress = useCallback((next: DeliveryAddress | null) => {
    setState(next);
    try {
      if (next) window.localStorage.setItem(KEY, JSON.stringify(next));
      else window.localStorage.removeItem(KEY);
    } catch {
      // Still set for this session.
    }
  }, []);

  const value = useMemo(() => ({ address, ready, setAddress }), [address, ready, setAddress]);
  return <AddressContext.Provider value={value}>{children}</AddressContext.Provider>;
}

export function useAddress(): AddressApi {
  const context = useContext(AddressContext);
  if (!context) throw new Error('useAddress must be used inside <AddressProvider>');
  return context;
}
