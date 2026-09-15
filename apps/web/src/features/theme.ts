/**
 * Theme choice: system (default), light or dark. The stamp on <html> wins over
 * the OS setting; the CSS in globals.css handles both. A tiny inline script in
 * the root layout applies the saved choice before the first paint (theme-boot.ts —
 * the layout is a server component, so the string lives away from the hooks).
 */
'use client';

import { useEffect, useState } from 'react';

import { THEME_KEY } from '@/features/theme-boot';

export type Theme = 'system' | 'light' | 'dark';
export const THEMES: readonly Theme[] = ['system', 'light', 'dark'];

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = theme;
  try {
    if (theme === 'system') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, theme);
  } catch {
    // private mode: the choice lives for this page only
  }
}

export function useTheme(): [Theme, (theme: Theme) => void] {
  const [theme, setTheme] = useState<Theme>('system');
  useEffect(() => {
    const saved = document.documentElement.dataset.theme;
    if (saved === 'dark' || saved === 'light') setTheme(saved);
  }, []);
  return [
    theme,
    (next) => {
      applyTheme(next);
      setTheme(next);
    },
  ];
}
