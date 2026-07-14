import React, { createContext, useContext, ReactNode } from 'react';
import { LIGHT_THEME, Theme } from '../constants/theme';

type ThemeContextValue = {
  theme: Theme;
  mode: 'light' | 'dark';
  // No toggleMode yet - hardcoded to light. This is the single place a
  // future Dark Mode setting plugs into (swap in a DARK_THEME based on a
  // stored preference); no consuming component should need to change.
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const value: ThemeContextValue = { theme: LIGHT_THEME, mode: 'light' };
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return ctx;
}
