/**
 * The app's language: remembered on the device, switchable from the menu.
 * `useT()` is what screens read strings through.
 */
import { isLocale, type Locale } from '@bazar/constants';
import { createT, type T } from '@bazar/i18n';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { readJson, writeJson } from './storage';

const KEY = 'bazar.locale';
const DEFAULT: Locale = 'ru';

interface LocaleState {
  locale: Locale;
  t: T;
  setLocale: (locale: Locale) => void;
}

const LocaleContext = createContext<LocaleState>({
  locale: DEFAULT,
  t: createT(DEFAULT),
  setLocale: () => undefined,
});

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT);
  useEffect(() => {
    void readJson(KEY, isLocale).then((stored) => stored && setLocaleState(stored));
  }, []);
  const value = useMemo<LocaleState>(
    () => ({
      locale,
      t: createT(locale),
      setLocale: (next) => {
        setLocaleState(next);
        writeJson(KEY, next);
      },
    }),
    [locale],
  );
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export const useLocale = () => useContext(LocaleContext);
export const useT = () => useContext(LocaleContext).t;
