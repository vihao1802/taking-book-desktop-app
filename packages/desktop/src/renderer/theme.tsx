import { createContext, useContext, useEffect, useState } from 'react';
import { isOk } from '@taking-book/core';
import type { Theme } from '../shared/types';

const THEME_ORDER: Theme[] = ['light', 'dark', 'sepia', 'system'];

interface ThemeContextValue {
  theme: Theme;
  resolved: 'light' | 'dark';
  setTheme: (theme: Theme) => void;
  cycleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function resolve(theme: Theme): 'light' | 'dark' {
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return theme === 'sepia' ? 'light' : theme;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('system');
  const [resolved, setResolved] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    let cancelled = false;
    window.api.getTheme().then((saved) => {
      if (!cancelled && isOk(saved)) setThemeState(saved.data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setResolved(resolve(theme));
    window.api.setTheme(theme);
  }, [theme]);

  useEffect(() => {
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setResolved(resolve('system'));
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', resolved === 'dark');
    // data-theme drives the sepia overrides in index.css; light/dark fall back
    // to the :root and .dark token blocks respectively.
    root.dataset.theme = theme === 'sepia' ? 'sepia' : resolved;
  }, [theme, resolved]);

  const setTheme = (next: Theme) => setThemeState(next);
  const cycleTheme = () => {
    const idx = THEME_ORDER.indexOf(theme);
    setThemeState(THEME_ORDER[(idx + 1) % THEME_ORDER.length]);
  };

  return (
    <ThemeContext.Provider value={{ theme, resolved, setTheme, cycleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
