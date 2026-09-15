/**
 * Where the order goes. One address at a time, remembered on the device.
 * ponytail: single address, no saved list — `api.addresses` later, same hook.
 */
import type { DeliveryAddress } from '@bazar/storefront';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { readJson, writeJson } from '@bazar/mobile';

export type { DeliveryAddress };
export { DEFAULT_POINT } from '@bazar/storefront';

const KEY = 'bazar.address';

interface AddressApi {
  address: DeliveryAddress | null;
  setAddress: (address: DeliveryAddress | null) => void;
}

const AddressContext = createContext<AddressApi | null>(null);

const isAddress = (v: unknown): v is DeliveryAddress =>
  typeof v === 'object' &&
  v !== null &&
  typeof (v as DeliveryAddress).text === 'string' &&
  typeof (v as DeliveryAddress).point?.lat === 'number';

export function AddressProvider({ children }: { children: ReactNode }) {
  const [address, setState] = useState<DeliveryAddress | null>(null);

  useEffect(() => {
    readJson(KEY, isAddress).then((stored) => stored && setState(stored));
  }, []);

  const setAddress = useCallback((next: DeliveryAddress | null) => {
    setState(next);
    writeJson(KEY, next);
  }, []);

  const value = useMemo(() => ({ address, setAddress }), [address, setAddress]);
  return <AddressContext.Provider value={value}>{children}</AddressContext.Provider>;
}

export function useAddress(): AddressApi {
  const context = useContext(AddressContext);
  if (!context) throw new Error('useAddress must be used inside <AddressProvider>');
  return context;
}
