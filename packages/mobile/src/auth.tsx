/**
 * Who is signed in. Tokens live in the API client's store; this keeps the
 * user object and exposes the two OTP steps the login screen walks through.
 * The same provider serves the customer and the courier app — the API
 * decides what the phone number is allowed to do.
 */
import type { CurrentUserDto } from '@bazar/types';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { api, onSignedOut, tokenStore } from './api';
import { readJson, writeJson } from './storage';

export interface AuthApi {
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
    let cancelled = false;
    (async () => {
      const tokens = await tokenStore.get();
      if (tokens) {
        const me = await api()
          .customers.user()
          .catch(() => null);
        if (!cancelled) setUser(me);
      }
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => onSignedOut(() => setUser(null)), []);

  const requestCode = useCallback(async (phone: string) => {
    const result = await api().auth.requestOtp({ phone });
    return { retryAfter: result.retryAfter, codeLength: result.codeLength };
  }, []);

  const verifyCode = useCallback(async (phone: string, code: string) => {
    const result = await api().auth.verifyOtp({ phone, code, deviceId: await deviceId() });
    setUser(result.user);
    return result.user;
  }, []);

  const signOut = useCallback(async () => {
    await api()
      .auth.logout()
      .catch(() => undefined);
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

/** A stable id per install, so sessions can be listed and revoked by device. */
async function deviceId(): Promise<string> {
  const KEY = 'bazar.device';
  const existing = await readJson(KEY, (value): value is string => typeof value === 'string');
  if (existing) return existing;
  const created = `app-${Math.random().toString(36).slice(2, 12)}`;
  writeJson(KEY, created);
  return created;
}
