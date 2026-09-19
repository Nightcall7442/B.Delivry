/**
 * Who is signed in. Tokens live in the API client's store; this only keeps the
 * user object and exposes the OTP steps the login screen walks through.
 */
'use client';

import type { CurrentUserDto, OtpChannel } from '@bazar/types';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { api, browserTokens, onSignedOut } from '@/lib/api';

interface AuthApi {
  user: CurrentUserDto | null;
  /** False until the stored session has been checked. */
  ready: boolean;
  requestCode: (
    phone: string,
    channel?: OtpChannel,
  ) => Promise<{ retryAfter: number; codeLength: number; channel: OtpChannel }>;
  verifyCode: (phone: string, code: string) => Promise<CurrentUserDto>;
  startTelegramLogin: () => Promise<{ code: string; url: string; expiresIn: number }>;
  /** One poll: the user once the bot signed them in, null while waiting; throws when expired. */
  telegramLogin: (code: string) => Promise<CurrentUserDto | null>;
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

  const startTelegramLogin = useCallback(() => api().auth.telegramStart(), []);

  const telegramLogin = useCallback(async (code: string) => {
    const result = await api().auth.telegramStatus(code);
    if (result.status === 'expired') throw new Error('expired');
    if (result.status === 'pending') return null;
    setUser(result.user);
    return result.user;
  }, []);

  const requestCode = useCallback(async (phone: string, channel?: OtpChannel) => {
    const result = await api().auth.requestOtp({ phone, ...(channel ? { channel } : {}) });
    return {
      retryAfter: result.retryAfter,
      codeLength: result.codeLength,
      channel: result.channel,
    };
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
    () => ({
      user,
      ready,
      requestCode,
      verifyCode,
      startTelegramLogin,
      telegramLogin,
      signOut,
      refresh,
    }),
    [user, ready, requestCode, verifyCode, startTelegramLogin, telegramLogin, signOut, refresh],
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
