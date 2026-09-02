import { useCallback, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'signagemadeeasy.theme';

function initialTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    // localStorage unavailable (private mode, disabled) — fall through to system preference.
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * Applied via [data-theme] on <html> (see app.css's dark-mode block) rather than a
 * class, matching the attribute name CSS already keys off. Mounted once at the app
 * root (not per-screen) so it takes effect on the login screen too, not just after
 * authenticating.
 */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(initialTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Best-effort — theme just won't persist across reloads if storage is unavailable.
    }
  }, []);

  return { theme, setTheme };
}
