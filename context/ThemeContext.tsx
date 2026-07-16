import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Appearance } from 'react-native';
import { LIGHT_THEME, DARK_THEME, Theme } from '../constants/theme';
import { storageGet, storageSet, STORAGE_KEYS } from '../utils/storage';

// What the user actually chose - 'system' means "follow the OS/browser
// setting", not a fixed mode of its own.
export type ThemePreference = 'light' | 'dark' | 'system';

type ThemeContextValue = {
  theme: Theme;
  // The RESOLVED mode - if preference is 'system', this is whatever the
  // device/browser's live color scheme currently is.
  mode: 'light' | 'dark';
  preference: ThemePreference;
  setPreference: (pref: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function resolveSystemScheme(): 'light' | 'dark' {
  return Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Defaults to 'system' until the saved preference (if any) loads in -
  // matches the "follow system setting by default" behavior agreed for
  // Dark Mode. A user who's never touched the setting always gets this;
  // one who has explicitly picked Light or Dark keeps that instead.
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [systemScheme, setSystemScheme] = useState<'light' | 'dark'>(resolveSystemScheme);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = await storageGet<ThemePreference>(STORAGE_KEYS.themePreference);
      if (!cancelled && saved) setPreferenceState(saved);
    })();
    return () => { cancelled = true; };
  }, []);

  // Tracks the OS/browser's color-scheme live, so 'system' mode updates
  // immediately if the user flips their device's setting while the app is
  // open, rather than needing a refresh to pick it up.
  useEffect(() => {
    const subscription = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemScheme(colorScheme === 'dark' ? 'dark' : 'light');
    });
    return () => subscription.remove();
  }, []);

  function setPreference(pref: ThemePreference) {
    setPreferenceState(pref);
    storageSet(STORAGE_KEYS.themePreference, pref);
  }

  const mode: 'light' | 'dark' = preference === 'system' ? systemScheme : preference;
  const theme = mode === 'dark' ? DARK_THEME : LIGHT_THEME;

  // Web only: RN's flex:1 chain only stretches the app's own root View to
  // fill however tall its content happens to be - on a short page (e.g.
  // Home when already signed in) that leaves the real <html>/<body>
  // underneath it exposed, which has no theme awareness of its own and
  // defaults to browser white. Keeping body's background in sync with the
  // active theme here fixes that without touching the height/flex chain
  // itself, which is deliberately left alone elsewhere (see BuildScreen's
  // sticky-header notes) since that setup is fragile.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.body.style.backgroundColor = theme.background;
    document.documentElement.style.backgroundColor = theme.background;
  }, [theme]);

  const value: ThemeContextValue = { theme, mode, preference, setPreference };
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return ctx;
}
