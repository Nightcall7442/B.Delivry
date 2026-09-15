/**
 * Who is signed in. Tokens live in the API client's store; this only keeps the
 * user object and exposes the OTP steps the login screen walks through.
 */
'use client';

import type { CurrentUserDto } from '@bazar/types';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { api, browserTokens, onSignedOut } from '@/lib/api';

interface AuthApi {
  user: CurrentUserDto | null;
  /** False until the stored session has been checked. */
  ready: boolean;
  requestCode: (phone: string) => Promise<{ retryAfter: number; codeLength: number }>;
  verifyCode: (phone: string, code: string) => Promise<CurrentUserDto>;
  signOut: () => Promise<void>;
  /** Re-reads the profile: after a Plus purchase, a language switch, a Telegram link. */
  refresh: () => Promise<void>;
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
    const result = await api().auth.verifyOtp({ phone, code, deviceId: deviceId() });
    setUser(result.user);
    return result.user;
  }, []);

  const signOut = useCallback(async () => {
    await api().auth.logout();
    setUser(null);
  }, []);

  const refresh = useCallback(async () => {
    await api()
      .customers.user()
      .then(setUser)
      .catch(() => undefined);
  }, []);

  const value = useMemo(
    () => ({ user, ready, requestCode, verifyCode, signOut, refresh }),
    [user, ready, requestCode, verifyCode, signOut, refresh],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthApi {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}

/** A stable id per browser, so sessions can be listed and revoked by device. */
function deviceId(): string {
  const KEY = 'bazar.device';
  try {
    const existing = window.localStorage.getItem(KEY);
    if (existing) return existing;
    const created = `web-${Math.random().toString(36).slice(2, 12)}`;
    window.localStorage.setItem(KEY, created);
    return created;
  } catch {
    return 'web';
  }
}
