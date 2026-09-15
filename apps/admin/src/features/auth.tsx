/**
 * Who is at the desk. Same OTP flow as the customer apps; the API decides what
 * the number may do, the panel only checks it is staff before drawing anything.
 */
'use client';

import type { CurrentUserDto } from '@bazar/types';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { api, browserTokens, onSignedOut } from '@/lib/api';

const STAFF = new Set(['OPERATOR', 'ADMIN', 'SUPER_ADMIN']);
/** A vendor sees only their own stalls: the cabinet, not the desk. */
const VENDOR = 'VENDOR';

interface AuthApi {
  user: CurrentUserDto | null;
  /** True once the stored session has been checked. */
  ready: boolean;
  /** Anyone allowed in: desk staff or a vendor. */
  isStaff: boolean;
  /** Vendor account (no desk rights): the cabinet navigation. */
  isVendor: boolean;
  requestCode: (phone: string) => Promise<{ retryAfter: number; codeLength: number }>;
  verifyCode: (phone: string, code: string) => Promise<CurrentUserDto>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthApi | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUserDto | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!browserTokens.get()) {
      setReady(true);
      return;
    }
    api()
      .customers.user()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setReady(true));
  }, []);

  useEffect(() => onSignedOut(() => setUser(null)), []);

  const requestCode = useCallback(async (phone: string) => {
    const result = await api().auth.requestOtp({ phone });
    return { retryAfter: result.retryAfter, codeLength: result.codeLength };
  }, []);

  const verifyCode = useCallback(async (phone: string, code: string) => {
    const result = await api().auth.verifyOtp({ phone, code, deviceId: 'admin-panel' });
    setUser(result.user);
    return result.user;
  }, []);

  const signOut = useCallback(async () => {
    await api()
      .auth.logout()
      .catch(() => undefined);
    browserTokens.set(null);
    setUser(null);
  }, []);

  const value = useMemo<AuthApi>(
    () => ({
      user,
      ready,
      isStaff: user?.roles.some((role) => STAFF.has(role) || role === VENDOR) ?? false,
      isVendor:
        (user?.roles.includes(VENDOR) ?? false) &&
        !(user?.roles.some((role) => STAFF.has(role)) ?? false),
      requestCode,
      verifyCode,
      signOut,
    }),
    [user, ready, requestCode, verifyCode, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthApi {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
