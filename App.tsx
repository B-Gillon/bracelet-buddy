import React, { useState, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import GlobalHeader, { AppPage } from './components/GlobalHeader';
import HomeScreen from './screens/HomeScreen';
import PatternsScreen from './screens/PatternsScreen';
import MyDesignsScreen from './screens/MyDesignsScreen';
import TutorialsScreen from './screens/TutorialsScreen';
import SettingsScreen from './screens/SettingsScreen';
import DesignCenterScreen from './screens/DesignCenterScreen';
import NewPatternScreen from './screens/NewPatternScreen';
import ColorPickerScreen from './screens/ColorPickerScreen';
import BuildScreen from './screens/BuildScreen';
import { PatternConfig } from './types/pattern';
import { storageGet, storageSet, storageRemove, STORAGE_KEYS } from './utils/storage';
import { loadPattern } from './utils/patterns';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ProfileProvider } from './context/ProfileContext';

type Screen =
  | 'home'
  | 'patterns'
  | 'my-designs'
  | 'tutorials'
  | 'settings'
  | 'design-center'
  | 'new-pattern'
  | 'color-picker'
  | 'build';

// Only these two steps hold a "real" in-progress pattern worth restoring
// after a refresh. 'new-pattern' is just an empty form - nothing to lose.
type RestorableScreen = 'color-picker' | 'build';

function isRestorableScreen(screen: Screen): screen is RestorableScreen {
  return screen === 'color-picker' || screen === 'build';
}

const ALL_SCREENS: Screen[] = [
  'home', 'patterns', 'my-designs', 'tutorials', 'settings',
  'design-center', 'new-pattern', 'color-picker', 'build',
];

// Web-only: the current screen is mirrored into a `?screen=` query param so
// a browser refresh reloads whatever page you were actually on, instead of
// always landing on Home. Native has no concept of "refresh", so these are
// no-ops there (window is undefined).
function getScreenFromUrl(): Screen | null {
  if (typeof window === 'undefined') return null;
  const value = new URLSearchParams(window.location.search).get('screen');
  return (ALL_SCREENS as string[]).includes(value ?? '') ? (value as Screen) : null;
}

function setScreenInUrl(screen: Screen) {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  params.set('screen', screen);
  window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
}

type SessionState = {
  screen: RestorableScreen;
  config: PatternConfig;
};

// The New Pattern / Color Picker / Build wizard all live "inside" the
// Design Center from a navigation standpoint, so that nav button stays
// highlighted for all three steps.
function activeNavForScreen(screen: Screen): AppPage {
  switch (screen) {
    case 'home':        return 'home';
    case 'patterns':    return 'patterns';
    case 'my-designs':  return 'my-designs';
    case 'tutorials':   return 'tutorials';
    case 'settings':    return 'settings';
    case 'design-center':
    case 'new-pattern':
    case 'color-picker':
    case 'build':
    default:
      return 'design-center';
  }
}

// Wraps the whole app in AuthProvider. Kept as a separate outer component
// so AppInner (and everything below it) can freely call useAuth().
export default function App() {
  return (
    <AuthProvider>
      <ProfileProvider>
        <AppInner />
      </ProfileProvider>
    </AuthProvider>
  );
}

function AppInner() {
  const [screen, setScreen]         = useState<Screen>('home');
  const [config, setConfig]         = useState<PatternConfig | null>(null);
  const [savedCount, setSavedCount] = useState(0);
  const [restored, setRestored]     = useState(false);
  const { user } = useAuth();

  // On first load, figure out which screen to show. The URL's ?screen=
  // param is authoritative if present (a real refresh of whatever page you
  // were on). Build/Color Picker also need the actual pattern data, which
  // only lives in local storage - so those pull config from there. A bare
  // visit with no ?screen= at all (e.g. a fresh root URL) falls back to
  // resuming wherever the last session left off, same as before.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const urlScreen = getScreenFromUrl();
      const saved = await storageGet<SessionState>(STORAGE_KEYS.session);

      if (urlScreen) {
        if (isRestorableScreen(urlScreen)) {
          if (!cancelled && saved && saved.config) {
            setConfig(saved.config);
            setScreen(urlScreen);
          } else if (!cancelled) {
            // URL says Build/Color Picker but there's no pattern to show
            // (e.g. storage was cleared) - nothing to resume into.
            setScreen('design-center');
          }
        } else if (!cancelled) {
          setScreen(urlScreen);
        }
      } else if (!cancelled && saved && saved.config) {
        setConfig(saved.config);
        setScreen(saved.screen);
      }

      if (!cancelled) setRestored(true);
    })();
    return () => { cancelled = true; };
  }, []);

  // Keep the URL in sync with the current screen going forward, so the
  // next refresh reloads wherever the user actually navigated to.
  useEffect(() => {
    if (!restored) return;
    setScreenInUrl(screen);
  }, [screen, restored]);

  // Keep the session cache in sync whenever there's an active in-progress
  // pattern. Screens without a real config (home, patterns, a blank
  // new-pattern form, etc.) intentionally aren't persisted here.
  useEffect(() => {
    if (!restored) return; // don't overwrite saved session before we've read it
    if (config && isRestorableScreen(screen)) {
      storageSet<SessionState>(STORAGE_KEYS.session, { screen, config });
    }
  }, [screen, config, restored]);

  function handleNavigate(page: AppPage) {
    setScreen(page);
  }

  function handleStartFromScratch() {
    setScreen('new-pattern');
  }

  function handleNext(newConfig: PatternConfig) {
    setConfig(newConfig);
    setScreen('color-picker');
  }

  function handleStart(palette: (string | null)[], colorCount: number) {
    if (!config) return;
    setConfig({ ...config, palette, colorCount, updatedAt: Date.now() });
    setScreen('build');
  }

  function handleBack() {
    setScreen('new-pattern');
  }

  function handleExit() {
    // Starting over discards the in-progress pattern entirely, so clear
    // both the session pointer and (if we have it) that pattern's cached
    // grid data.
    storageRemove(STORAGE_KEYS.session);
    if (config) storageRemove(STORAGE_KEYS.patternState(config.id));
    setConfig(null);
    setScreen('design-center');
  }

  function handleConfigChange(updated: PatternConfig) {
    setConfig(updated);
  }

  // Opening a saved design from My Designs. BuildScreen hydrates its grid
  // from local storage on mount (not from a prop), so the loaded data has
  // to be seeded into that same cache *before* switching to the Build
  // screen - otherwise BuildScreen would find nothing cached and show a
  // blank grid instead of what was actually saved.
  async function handleOpenPattern(clientId: string) {
    if (!user) return;
    const { config: loadedConfig, dualGrid: loadedGrid, error } = await loadPattern(user.id, clientId);
    if (error || !loadedConfig || !loadedGrid) {
      console.warn('[open pattern] failed to load:', error);
      return;
    }
    await storageSet(STORAGE_KEYS.patternState(loadedConfig.id), {
      dualGrid: loadedGrid,
      palette: loadedConfig.palette,
    });
    setConfig(loadedConfig);
    setScreen('build');
  }

  // Avoid a flash of the Home screen while we're still checking for a
  // session to restore.
  if (!restored) {
    return <View style={s.app} />;
  }

  const header = (
    <GlobalHeader active={activeNavForScreen(screen)} onNavigate={handleNavigate} />
  );

  if (screen === 'build' && config) {
    // BuildScreen needs to avoid a flex/height-constrained parent so its
    // internal ScrollView + stickyHeaderIndices can drive page scroll on
    // web (see BuildScreen notes). But Expo Web's root container lays out
    // as a row, so a totally unstyled View shrink-wraps to content width
    // instead of filling the viewport. width: '100%' fixes that without
    // touching height/flex, which is what the sticky-scroll fix depends on.
    return (
      <View style={{ width: '100%' }}>
        {header}
        <BuildScreen
          config={config}
          onConfigChange={handleConfigChange}
          onExit={handleExit}
          onRequireAccount={() => setScreen('home')}
        />
      </View>
    );
  }

  return (
    <View style={s.app}>
      {header}
      <View style={s.body}>
        {screen === 'home' && <HomeScreen onGoToProfile={() => setScreen('settings')} />}
        {screen === 'patterns' && <PatternsScreen />}
        {screen === 'my-designs' && <MyDesignsScreen onOpenPattern={handleOpenPattern} />}
        {screen === 'tutorials' && <TutorialsScreen />}
        {screen === 'settings' && <SettingsScreen />}
        {screen === 'design-center' && (
          <DesignCenterScreen onStartFromScratch={handleStartFromScratch} />
        )}
        {screen === 'new-pattern' && (
          <NewPatternScreen
            existingCount={savedCount}
            onNext={handleNext}
          />
        )}
        {screen === 'color-picker' && config && (
          <ColorPickerScreen
            palette={config.palette}
            colorCount={config.colorCount}
            onStart={handleStart}
            onBack={handleBack}
          />
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  app:  { flex: 1, backgroundColor: '#fff' },
  body: { flex: 1 },
});
