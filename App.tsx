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

export default function App() {
  const [screen, setScreen]         = useState<Screen>('home');
  const [config, setConfig]         = useState<PatternConfig | null>(null);
  const [savedCount, setSavedCount] = useState(0);
  const [restored, setRestored]     = useState(false);

  // On first load, check for an in-progress pattern from a previous session
  // (e.g. before a browser refresh) and jump straight back into it.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = await storageGet<SessionState>(STORAGE_KEYS.session);
      if (!cancelled && saved && saved.config) {
        setConfig(saved.config);
        setScreen(saved.screen);
      }
      if (!cancelled) setRestored(true);
    })();
    return () => { cancelled = true; };
  }, []);

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
        />
      </View>
    );
  }

  return (
    <View style={s.app}>
      {header}
      <View style={s.body}>
        {screen === 'home' && <HomeScreen />}
        {screen === 'patterns' && <PatternsScreen />}
        {screen === 'my-designs' && <MyDesignsScreen />}
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
